/**
 * 企评小宝 · 评估方法与流程可视化（visualize.js）
 *
 * 基于 indicators.js / engine.js 的真实数据，把整套评估方法论渲染成可视化面板：
 *   ① 评估流程     —— 输入 → 标准化 → 三层加权 → 聚合总分 → 报告生成
 *   ② 指标体系     —— 7 大维度 / 22 一级 / 49 二级真实配置树
 *   ③ 标准化公式   —— 正向/负向最小最大线性标准化 + 真实指标示例计算
 *   ④ 三层加权     —— 二级 → 一级 → 维度 → 总分，标注引擎实现位置
 *   ⑤ 场景权重     —— 4 套场景 × 7 维度权重对比条
 *   ⑥ 缺失降权     —— 分子分母同步扣权重的算例对比
 *
 * 接口：
 *   QB_VISUAL.buildFlowHTML() / buildTreeHTML() / buildFormulaHTML()
 *   QB_VISUAL.buildLayersHTML() / buildWeightsHTML() / buildMissingHTML()
 *   QB_VISUAL.renderAll()  —— 渲染全部面板并绑定 tab 切换（供 app.js 调用）
 *   QB_VISUAL.init()       —— renderAll 别名
 *
 * 与项目其它模块一致：浏览器挂全局（QB_VISUAL），Node 下可 require 供校验。
 */

(function (global) {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
    });
  }

  // 环境自适应：浏览器取全局，Node 环境 require（与 engine.js 同款策略）
  const QB_INDICATORS =
    (typeof global.QB_INDICATORS !== "undefined")
      ? global.QB_INDICATORS
      : (typeof module !== "undefined" ? require("./indicators.js") : null);
  const QB_ENGINE =
    (typeof global.QB_ENGINE !== "undefined")
      ? global.QB_ENGINE
      : (typeof module !== "undefined" ? require("./engine.js") : null);
  const QB_EVIDENCE =
    (typeof global.QB_EVIDENCE !== "undefined")
      ? global.QB_EVIDENCE
      : (typeof module !== "undefined" ? require("./evidence.js") : null);

  /** 视角核心问题（方案 4.2 多视角适配，key 与 scenarios 对齐） */
  const PERSPECTIVE_QUESTIONS = {
    investment: "这是一笔好投资吗？",
    diligence: "公司健康度如何？",
    job: "我应该在这里工作吗？",
    cooperation: "这家公司值得合作吗？",
  };

  const QB_VISUAL = {
    /** 7 维配色（与指标库维度顺序对齐，复用雷达图色系） */
    PALETTE: ["#2f6bff", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316"],

    /** 维度短名（用于权重图的紧凑轴标） */
    SHORT_NAMES: { d1: "行业", d2: "财务", d3: "治理", d4: "技术", d5: "资本", d6: "风险", d7: "生态" },

    // ============ ① 评估流程 ============
    buildFlowHTML() {
      const steps = [
        { t: "输入企业数据", d: "企业名称 + 场景选择；公开数据 / 示例企业 / 用户补充填报", c: "app.js · onStart / collectValues" },
        { t: "标准化评分", d: "最小最大线性标准化，正向 / 负向公式，得分 0–100", c: "engine.js · normalize" },
        { t: "三层加权聚合", d: "二级 → 一级 → 维度，逐层按权重加权求和", c: "engine.js · scoreLevel1 / scoreDimension" },
        { t: "聚合总分", d: "维度得分 × 场景权重求和，归一化后得 0–100 总分", c: "engine.js · score" },
        { t: "可解释报告", d: "总分评级 + 7 维雷达图 + 逐层依据 + TOP3 / 风险 / 建议 + 历史对比", c: "radar.js / report.js / history.js" },
      ];
      const nodes = steps.map(function (s, i) {
        return '<div class="flow-node"><span class="flow-dot">' + (i + 1) + "</span>"
          + '<div class="flow-body"><b>' + esc(s.t) + "</b><p>" + esc(s.d) + "</p>"
          + "<code>" + esc(s.c) + "</code></div></div>";
      }).join('<span class="flow-arrow">▸</span>');
      return '<div class="viz-flow">' + nodes + "</div>"
        + '<p class="viz-note">数据链路：表单值 → engine.score() → 总分/维度得分 → 雷达图与报告（全部本地离线计算）。</p>';
    },

    // ============ ② 指标体系树 ============
    buildTreeHTML() {
      if (!QB_INDICATORS) return '<p class="empty-tip">指标体系模块未加载。</p>';
      const c = QB_INDICATORS.count();
      const head = '<div class="tree-meta">共 <b>' + c.dimensions + "</b> 大维度 / <b>"
        + c.level1 + "</b> 个一级指标 / <b>" + c.level2 + "</b> 个二级指标"
        + ' <span class="tree-src">证据标签：'
        + '<span class="ev-tag ev-documented">Documented · 文档支撑</span> '
        + '<span class="ev-tag ev-inferred">Inferred · 推演补齐</span></span></div>';
      const dims = (QB_INDICATORS.dimensions || []).map(function (dim, di) {
        const l1 = (dim.children || []).map(function (l1c) {
          const leaves = (l1c.children || []).map(function (leaf) {
            const dir = leaf.direction === "negative" ? '<span class="tag tag-neg">负向 · 越低越好</span>'
              : '<span class="tag tag-pos">正向 · 越高越好</span>';
            const src = QB_EVIDENCE
              ? QB_EVIDENCE.labelHTML(QB_EVIDENCE.typeOf(l1c.source || dim.source, true))
              : ((l1c.source || "").indexOf("推演") >= 0
                ? '<span class="src src-mixed">[推演补齐]</span>'
                : '<span class="src src-public">[PDF公开]</span>');
            return '<div class="tree-leaf">'
              + "<code class=\"leaf-id\">" + esc(leaf.id) + "</code>"
              + "<span class=\"leaf-name\">" + esc(leaf.name) + "</span>"
              + dir
              + '<span class="leaf-range">参考 ' + esc(String(leaf.reference && leaf.reference.min)) + " ~ "
              + esc(String(leaf.reference && leaf.reference.max)) + (leaf.unit ? " " + esc(leaf.unit) : "") + "</span>"
              + '<span class="leaf-w">权重 ' + Number(leaf.weight).toFixed(2) + "</span>"
              + src
              + "</div>";
          }).join("");
          return '<details class="tree-l1"><summary>'
            + '<span class="l1-name">' + esc(l1c.name) + "</span>"
            + '<span class="l1-count">' + (l1c.children || []).length + " 项</span>"
            + (QB_EVIDENCE
              ? QB_EVIDENCE.labelHTML(QB_EVIDENCE.typeOf(l1c.source, true))
              : ((l1c.source || "").indexOf("推演") >= 0 ? '<span class="src src-mixed">[推演补齐]</span>' : '<span class="src src-public">[PDF公开]</span>'))
            + "</summary><div class=\"tree-leaves\">" + leaves + "</div></details>";
        }).join("");
        return '<details class="tree-dim" open><summary>'
          + '<span class="dim-chip" style="background:' + this.PALETTE[di % this.PALETTE.length] + '">' + esc(dim.id) + "</span>"
          + '<span class="dim-name">' + esc(dim.name) + "</span>"
          + '<span class="dim-count">' + (dim.children || []).length + " 个一级指标</span>"
          + '<span class="dim-desc">' + esc(dim.desc) + "</span>"
          + "</summary><div class=\"tree-l1s\">" + l1 + "</div></details>";
      }.bind(this)).join("");
      return head + '<div class="tree-root">' + dims + "</div>";
    },

    // ============ ③ 标准化公式 ============
    _findIndicator(direction) {
      if (!QB_INDICATORS) return null;
      let found = null;
      (QB_INDICATORS.dimensions || []).forEach(function (d) {
        (d.children || []).forEach(function (l1) {
          (l1.children || []).forEach(function (i) {
            if (!found && i.direction === direction) found = i;
          });
        });
      });
      return found;
    },

    buildFormulaHTML() {
      const card = function (label, formula, note, ind, demoVal) {
        if (!ind) return "";
        const min = ind.reference && typeof ind.reference.min === "number" ? ind.reference.min : 0;
        const max = ind.reference && typeof ind.reference.max === "number" ? ind.reference.max : 100;
        const x = demoVal;
        const xnorm = max !== min ? (x - min) / (max - min) : 1;
        const final = ind.direction === "negative" ? 1 - xnorm : xnorm;
        const score = Math.round(Math.max(0, Math.min(1, final)) * 10000) / 100;
        const calc = ind.direction === "negative"
          ? "1 − (" + x + " − " + min + ") / (" + max + " − " + min + ") = " + Number(final.toFixed(4)) + " × 100 → <b>" + score.toFixed(2) + " 分</b>"
          : "(" + x + " − " + min + ") / (" + max + " − " + min + ") = " + Number(final.toFixed(4)) + " × 100 → <b>" + score.toFixed(2) + " 分</b>";
        return '<div class="formula-card"><div class="f-head">'
          + '<span class="tag ' + (ind.direction === "negative" ? "tag-neg" : "tag-pos") + '">'
          + (ind.direction === "negative" ? "负向指标 · 越小越好" : "正向指标 · 越大越好") + "</span>"
          + '<code class="f-id">' + esc(ind.id) + " · " + esc(ind.name) + "</code></div>"
          + '<div class="formula">' + formula + "</div>"
          + '<p class="f-note">' + esc(note) + "</p>"
          + '<div class="f-example"><b>真实计算示例</b>（' + esc(ind.name)
          + "，参考区间 " + min + " ~ " + max + (ind.unit ? " " + esc(ind.unit) : "") + "，输入 " + x + "）：<br>"
          + calc + "</div></div>";
      };

      const pos = this._findIndicator("positive");
      const neg = this._findIndicator("negative");
      const posDemo = pos && typeof pos.reference.max === "number" ? Math.round(pos.reference.max * 0.3) : 30;
      const negDemo = neg && typeof neg.reference.max === "number" ? Math.round(neg.reference.max * 0.3) : 30;

      return '<div class="formula-grid">'
        + card("正向",
          "归一化 = ( x − min ) / ( max − min )",
          "数值越大得分越高：落在区间下限得 0 分，上限得 100 分，线性插值。",
          pos, posDemo)
        + card("负向",
          "归一化 = 1 − ( x − min ) / ( max − min )",
          "数值越大得分越低（如风险类指标）：区间下限得 100 分，上限得 0 分。",
          neg, negDemo)
        + "</div>"
        + '<p class="viz-note">得分 = 归一化结果 × 100（保留两位小数），越界值钳制到 [0,100]；参考区间退化为单点（max=min）时记 100 分。公式与钳制逻辑见 engine.js normalize()。</p>';
    },

    // ============ ④ 三层加权 ============
    buildLayersHTML() {
      if (!QB_INDICATORS) return '<p class="empty-tip">指标体系模块未加载。</p>';
      const c = QB_INDICATORS.count();
      const investment = QB_INDICATORS.scenarios && QB_INDICATORS.scenarios.investment
        ? QB_INDICATORS.scenarios.investment.weights : null;
      const wMeta = investment
        ? (QB_INDICATORS.dimensions || []).map(function (d) {
            const w = investment[d.id];
            return d.id + "=" + (typeof w === "number" ? Number(w).toFixed(2) : "—");
          }).join("，")
        : "";
      const layer = function (no, title, meta, formula, note) {
        return '<div class="layer-card"><div class="layer-no">L' + no + "</div>"
          + "<h4>" + esc(title) + "</h4><p class=\"layer-meta\">" + esc(meta) + "</p>"
          + '<div class="formula">' + formula + "</div>"
          + "<p class=\"f-note\">" + esc(note) + "</p></div>";
      };
      return '<div class="layer-stack">'
        + layer(1, "二级指标 → 一级指标",
          "49 个二级指标按权重加权求和；缺失项在分子分母同步扣除",
          "s = Σ ( wᵢ × normᵢ ) / Σ wᵢ", "引擎位置：engine.js · scoreLevel1()")
        + '<span class="layer-arrow">↓</span>'
        + layer(2, "一级指标 → 维度",
          "22 个一级指标按各自权重聚合到 7 大维度",
          "s = Σ ( wⱼ × s₁ⱼ ) / Σ wⱼ", "引擎位置：engine.js · scoreDimension()")
        + '<span class="layer-arrow">↓</span>'
        + layer(3, "维度 → 综合总分",
          "7 大维度得分 × 场景权重求和并归一化，得 0–100 总分",
          "T = Σ ( wₖ × s₂ₖ ) / Σ wₖ", "引擎位置：engine.js · score()")
        + "</div>"
        + (wMeta ? '<p class="viz-note">默认「投资参考」场景维度权重：' + esc(wMeta) + "（合计 = 1）。</p>" : "");
    },

    // ============ ⑤ 场景权重对比 ============
    buildWeightsHTML() {
      if (!QB_INDICATORS || !QB_INDICATORS.scenarios) return '<p class="empty-tip">场景配置未加载。</p>';
      const scs = QB_INDICATORS.scenarios;
      const keys = Object.keys(scs).filter(function (k) { return k !== "custom"; });
      const dims = QB_INDICATORS.dimensions || [];

      const legend = '<div class="viz-legend">'
        + dims.map(function (d, i) {
          return '<span class="legend-item"><i style="background:' + this.PALETTE[i % this.PALETTE.length] + '"></i>'
            + esc(d.name) + "</span>";
        }.bind(this)).join("") + "</div>";

      const rows = keys.map(function (k) {
        const sc = scs[k];
        const cols = dims.map(function (d, i) {
          const w = sc.weights && typeof sc.weights[d.id] === "number" ? sc.weights[d.id] : 0;
          const h = Math.max(4, Math.round(w * 150));
          return '<div class="wcol"><div class="wbar" style="height:' + h + "px;background:" + this.PALETTE[i % this.PALETTE.length]
            + '" title="' + esc(d.name) + " 权重 " + Number(w).toFixed(2) + '"><b>' + Number(w).toFixed(2) + "</b></div>"
            + '<span class="wd">' + esc(this.SHORT_NAMES[d.id] || d.id) + "</span></div>";
        }.bind(this)).join("");
        const sum = dims.reduce(function (acc, d) { return acc + (sc.weights && typeof sc.weights[d.id] === "number" ? sc.weights[d.id] : 0); }, 0);
        return '<div class="wrow"><div class="wscene"><b>' + esc(sc.name) + "</b><span>" + esc(sc.desc) + "</span>"
          + '<span class="wquest">核心问题：' + esc(PERSPECTIVE_QUESTIONS[k] || "该视角下此企业表现如何？") + "</span></div>"
          + '<div class="wbars">' + cols + "</div>"
          + '<div class="wsum">Σ=' + Number(sum).toFixed(2) + "</div></div>";
      }.bind(this)).join("");

      return legend + '<div class="wtable">' + rows + "</div>"
        + '<p class="viz-note">柱高 = 权重值（合计 1.00）。「求职择业」场景加重「风险水平」（0.30），「合作评估」更看「治理水平」（0.20）；界面内还支持「自定义权重」覆盖任意维度。</p>';
    },

    // ============ ⑥ 缺失降权 ============
    buildMissingHTML() {
      if (!QB_INDICATORS) return '<p class="empty-tip">指标体系模块未加载。</p>';
      // 取第一个一级指标下的前 3 个二级指标做算例（真实权重）
      let group = null;
      (QB_INDICATORS.dimensions || []).some(function (d) {
        return (d.children || []).some(function (l1) {
          if ((l1.children || []).length >= 3) { group = l1; return true; }
          return false;
        });
      });
      if (!group) return '<p class="empty-tip">无可演示的指标组。</p>';

      const items = group.children.slice(0, 3);
      const w = items.map(function (i) { return i.weight; });
      const wSum = w.reduce(function (a, b) { return a + b; }, 0);
      // 示意得分（仅用于演示计算过程）
      const demo = [85, 70, 60];

      const fmt = function (list) { return list.map(function (x) { return Number(x).toFixed(2); }).join(" + "); };

      const fullNum = demo.reduce(function (acc, s, i) { return acc + w[i] * s; }, 0);
      const fullScore = Number((fullNum / wSum).toFixed(2));
      const missNum = demo.slice(0, 2).reduce(function (acc, s, i) { return acc + w[i] * s; }, 0);
      const missW = wSum - w[2];
      const missScore = Number((missNum / missW).toFixed(2));

      const card = function (title, cls, calcStr, score, extra) {
        return '<div class="miss-card ' + cls + '"><h4>' + esc(title) + "</h4>"
          + '<div class="formula">' + calcStr + "</div>"
          + '<div class="miss-score"><b>' + score + "</b><span>分</span></div>"
          + (extra ? "<p class=\"f-note\">" + esc(extra) + "</p>" : "") + "</div>";
      };

      return '<div class="miss-prefix">以「' + esc(group.name) + '」为例（真实权重：'
        + items.map(function (i) { return esc(i.name) + " " + Number(i.weight).toFixed(2); }).join("，")
        + "；得分为演示值）：</div>"
        + '<div class="miss-grid">'
        + card("全部已知（3 项齐全）", "",
          "s = (" + fmt(w.map(function (x, i) { return w[i] + "×" + demo[i]; })) + ") / " + Number(wSum).toFixed(2)
          + " = " + Number(fullNum.toFixed(2)) + " / " + Number(wSum.toFixed(2)),
          fullScore)
        + '<span class="miss-vs">对比</span>'
        + card("缺失「" + items[2].name + "」", "miss",
          "s = (" + fmt(w.slice(0, 2).map(function (x, i) { return w[i] + "×" + demo[i]; })) + ") / " + Number(missW.toFixed(2))
          + " = " + Number(missNum.toFixed(2)) + " / " + Number(missW.toFixed(2)),
          missScore,
          "缺口权重（0.30）在分子分母同步扣除 → 因数据不全反而略升，不会把总分拉低；结构风险同样适用（engine.js scoreLevel1 缺项即不累加）。")
        + "</div>"
        + '<p class="viz-note">原理：缺失指标只影响「被观测到的部分」之间的相对权重，总分始终在已知数据上重新归一化 —— 对信息不完整的普通用户友好，避免「因为不知道所以扣分」。</p>';
    },

    // ============ 渲染入口 ============
    renderAll() {
      const TABS = {
        flow: this.buildFlowHTML(),
        tree: this.buildTreeHTML(),
        formula: this.buildFormulaHTML(),
        layers: this.buildLayersHTML(),
        weights: this.buildWeightsHTML(),
        missing: this.buildMissingHTML(),
      };
      Object.keys(TABS).forEach(function (key) {
        const el = document.getElementById("viz-" + key);
        if (el) el.innerHTML = TABS[key];
      });

      // tab 切换
      const root = document.getElementById("viz-methods");
      if (!root) return;
      root.querySelectorAll(".viz-tab").forEach(function (btn) {
        btn.addEventListener("click", function () {
          root.querySelectorAll(".viz-tab").forEach(function (b) { b.classList.remove("active"); });
          btn.classList.add("active");
          root.querySelectorAll(".viz-panel").forEach(function (p) { p.classList.add("hidden"); });
          const target = document.getElementById("viz-" + btn.getAttribute("data-viz"));
          if (target) target.classList.remove("hidden");
        });
      });
    },
  };

  QB_VISUAL.init = QB_VISUAL.renderAll;
  global.QB_VISUAL = QB_VISUAL;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = QB_VISUAL;
  }
})(typeof window !== "undefined" ? window : globalThis);