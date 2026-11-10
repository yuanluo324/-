/**
 * 企评小宝 · 评估历史与多企业对比（history.js）
 *
 * 依赖：radar.js（对比雷达图）
 * 接口：
 *   QB_HISTORY.save(result, values)  —— 保存一次评估
 *   QB_HISTORY.renderAll(listId, chartId) —— 渲染历史列表 + 多企业对比雷达图
 *   QB_HISTORY.remove(id)
 *   QB_HISTORY.loadAll()
 *   QB_HISTORY.clear()
 *
 * 存储：localStorage（键 QB_HISTORY_V1），不可用时降级为内存数组。
 */

(function (global) {
  "use strict";

  const KEY = "QB_HISTORY_V1";
  const MAX = 50; // 最多保留 50 条

  function now() {
    try { return new Date().toISOString(); } catch (e) { return ""; }
  }

  function fmtTime(iso) {
    if (!iso) return "--";
    try {
      const d = new Date(iso);
      const p = (n) => String(n).padStart(2, "0");
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate())
        + " " + p(d.getHours()) + ":" + p(d.getMinutes());
    } catch (e) { return iso; }
  }

  function storage() {
    try {
      const test = "__qb_test__";
      global.localStorage.setItem(test, "1");
      global.localStorage.removeItem(test);
      return global.localStorage;
    } catch (e) {
      return null;
    }
  }

  const QB_HISTORY = {
    // 内存兜底
    _mem: [],

    loadAll() {
      const s = storage();
      if (s) {
        try {
          const raw = s.getItem(KEY);
          const arr = raw ? JSON.parse(raw) : [];
          return Array.isArray(arr) ? arr : [];
        } catch (e) {
          return this._mem.slice();
        }
      }
      return this._mem.slice();
    },

    _persist(list) {
      const s = storage();
      if (s) {
        try { s.setItem(KEY, JSON.stringify(list)); } catch (e) { /* 忽略配额错误 */ }
      }
      this._mem = list.slice();
    },

    /**
     * 保存一次评估
     * @param {object} result engine.score() 的返回值（含 companyName）
     * @param {object} values 指标值映射（可选，存一份快照）
     */
    save(result, values) {
      if (!result) return null;
      const list = this.loadAll();
      const rec = {
        id: "h" + Date.now() + Math.floor(Math.random() * 1000),
        time: now(),
        companyName: result.companyName || "未命名企业",
        scenarioName: result.scenarioName || "投资参考",
        total: result.total === null || result.total === undefined ? null : Math.round(result.total * 100) / 100,
        missingCount: result.missingCount || 0,
        totalCount: result.totalCount || 0,
        // 维度得分快照（用于对比雷达图）
        dims: (result.dims || []).map((d) => ({ id: d.id, name: d.name, score: d.score })),
        values: values ? JSON.parse(JSON.stringify(values)) : null,
      };
      list.unshift(rec);
      if (list.length > MAX) list.length = MAX;
      this._persist(list);
      return rec;
    },

    remove(id) {
      if (!id) return;
      const list = this.loadAll().filter((r) => r.id !== id);
      this._persist(list);
    },

    clear() {
      this._persist([]);
    },

    /**
     * 渲染历史列表 + 对比雷达图
     * @param {string} listId  历史表格容器 id
     * @param {string} chartId 对比雷达图容器 id
     */
    renderAll(listId, chartId) {
      const listEl = document.getElementById(listId);
      const chartEl = document.getElementById(chartId);
      const list = this.loadAll();

      // —— 历史列表 ——
      if (!listEl) return;
      if (!list.length) {
        listEl.innerHTML = '<p class="empty-tip">暂无评估历史，完成一次评估后会自动保存。</p>';
      } else {
        const rows = list.map((r) => {
          const total = r.total === null ? "--" : r.total.toFixed(1);
          const miss = (r.totalCount || 0) > 0 ? "（缺失 " + r.missingCount + "/" + r.totalCount + "）" : "";
          return '<tr>'
            + '<td>' + escHtml(r.companyName) + '</td>'
            + '<td>' + escHtml(r.scenarioName) + '</td>'
            + '<td><b class="hist-total">' + total + '</b>' + miss + '</td>'
            + '<td>' + fmtTime(r.time) + '</td>'
            + '<td><button class="del-btn" data-del="' + r.id + '" title="删除该记录">删除</button></td>'
            + "</tr>";
        }).join("");
        listEl.innerHTML = '<div class="table-wrap"><table class="history-table">'
          + "<thead><tr><th>企业</th><th>场景</th><th>综合评分</th><th>评估时间</th><th></th></tr></thead>"
          + "<tbody>" + rows + "</tbody></table></div>";

        // 删除按钮事件
        listEl.querySelectorAll("button[data-del]").forEach((btn) => {
          btn.addEventListener("click", () => {
            this.remove(btn.getAttribute("data-del"));
            this.renderAll(listId, chartId);
          });
        });
      }

      // —— 对比雷达图 ——
      if (!chartEl) return;
      if (list.length < 1) {
        chartEl.innerHTML = '<p class="empty-tip">完成至少一次评估后，可在此查看多企业维度对比。</p>';
        return;
      }
      // 取最近 4 条做对比，避免图形过于拥挤
      const series = list.slice(0, 4).map((r) => ({
        name: r.companyName + " · " + r.total,
        dims: r.dims,
      }));
      if (global.QB_RADAR && global.QB_RADAR.renderCompare) {
        QB_RADAR.renderCompare(series, chartId);
      } else {
        chartEl.textContent = "[对比雷达图模块未加载]";
      }
    },
  };

  // HTML 转义（本地小工具）
  function escHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[m]));
  }

  global.QB_HISTORY = QB_HISTORY;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = QB_HISTORY;
  }
})(typeof window !== "undefined" ? window : globalThis);