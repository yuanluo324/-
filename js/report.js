/**
 * 企评小宝 · 可解释评估报告（report.js）
 *
 * 输入：QB_ENGINE.score() 的结果
 *   result = {
 *     total, dims: [{id,name,desc,score,covered,weight,children:[{id,name,score,covered,detail:[{id,name,raw,score,missing,unit}]}]}],
 *     weights, scenarioName, missingCount, totalCount
 *   }
 * 输出：渲染到容器的 HTML —— 总分与评级、各维度得分条、逐维度得分依据、
 *       优势项 TOP3、风险提示、改进建议。
 *
 * 集成《企业评估交互端全栈方案设计》4.3 证据链查看器落地：
 *   - 报告头：数据覆盖率进度条 + 四类证据台账计数 + 置信度徽标
 *   - 维度块：覆盖率徽标 + 置信度徽标
 *   - 二级指标叶子：证据类型标签（Documented/Discovered/Inferred/Missing）
 *
 * 接口：
 *   QB_REPORT.renderReport(result, containerId)
 *   QB_REPORT.render(result, containerId)   // 别名
 */

(function (global) {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
    });
  }

  /** 环境自适应获取证据链工具（浏览器全局 / Node require） */
  function getEvidence() {
    if (global.QB_EVIDENCE) return global.QB_EVIDENCE;
    if (typeof module !== "undefined" && module.exports) {
      try { return require("./evidence.js"); } catch (e) { return null; }
    }
    return null;
  }

  const QB_REPORT = {
    /** 评级 */
    grade(total) {
      if (total === null || total === undefined) return { label: "数据不足", cls: "x" };
      if (total >= 85) return { label: "A · 优秀", cls: "a" };
      if (total >= 70) return { label: "B · 良好", cls: "b" };
      if (total >= 55) return { label: "C · 中等", cls: "c" };
      if (total >= 40) return { label: "D · 关注", cls: "d" };
      return { label: "E · 高风险", cls: "x" };
    },

    /** 某指标点评语 */
    comment(score) {
      if (score === null || score === undefined) return "数据缺失，已自动降权";
      if (score >= 85) return "表现优秀，是显著优势";
      if (score >= 70) return "表现良好，具备竞争力";
      if (score >= 55) return "基本达标，仍有提升空间";
      if (score >= 40) return "明显短板，需重点改进";
      return "风险突出，建议尽快采取行动";
    },

    /** 覆盖率进度条 + 置信度徽标（缺失项越少越绿，>=90% 高置信） */
    coverageHTML(missing, total, clsPrefix) {
      const ev = getEvidence();
      if (!ev) return "";
      const pct = ev.coverage(missing, total);
      const conf = ev.confidence(missing, total);
      const grad = pct >= 90 ? "" : (pct >= 70 ? " low" : " very-low");
      const confCls = pct >= 90 ? "hi" : (pct >= 70 ? "mid" : "lo");
      return ""
        + '<div class="' + (clsPrefix || "cov-row") + '">'
        + '<small>数据覆盖率</small>'
        + '<div class="cov-bar"><div class="cov-fill' + grad + '" style="width:' + pct + '%"></div></div>'
        + '<span class="cov-text">' + pct + "%</span>"
        + '<span class="conf-badge ' + confCls + '">置信度 ' + conf + "</span>"
        + "</div>";
    },

    /**
     * 生成报告头：总分 + 评级 + 元信息 + 证据摘要（覆盖率 / 证据台账 / 置信度）
     */
    renderHeader(result) {
      const g = this.grade(result.total);
      const meta = (result.companyName ? esc(result.companyName) + " · " : "")
        + esc(result.scenarioName || "投资参考")
        + " · 已覆盖 " + (result.totalCount - (result.missingCount || 0)) + "/" + result.totalCount + " 项指标";

      // 证据台账（设计方案 4.3：Documented n · Discovered n · Inferred n · Missing n）
      let evSummaryHtml = "";
      const ev = getEvidence();
      if (ev) {
        const stat = ev.summarize(result);
        const tags = [
          { k: "documented", label: "Documented" }, { k: "discovered", label: "Discovered" },
          { k: "inferred", label: "Inferred" }, { k: "missing", label: "Missing" },
        ].map(function (t) {
          return '<span class="ev-tag ' + ev.types[t.k].cls + '">' + t.label + " " + stat[t.k] + "</span>";
        }).join("");
        evSummaryHtml = '<div class="ev-summary"><div class="ev-tags">' + tags + "</div>"
          + this.coverageHTML(stat.missing, stat.total, "cov-row") + "</div>";
      }

      return '<div class="report-head">'
        + '<div class="report-total"><b>' + (result.total === null ? "--" : result.total.toFixed(2)) + '</b><span>综合评分</span></div>'
        + '<div class="report-grade grade ' + g.cls + '">' + g.label + '</div>'
        + '<div class="report-meta">' + meta + "</div>"
        + evSummaryHtml
        + "</div>";
    },

    /**
     * 各维度得分条（含权重标注与覆盖率徽标）
     */
    renderDimBars(result) {
      const dims = result.dims || [];
      return '<div class="dim-bars">'
        + dims.map((d) => {
          const sc = d.score === null || d.score === undefined ? "—" : d.score.toFixed(1);
          const w = (d.weight || 0).toFixed(2);
          const pct = (d.score === null || d.score === undefined) ? 0 : Math.round(d.score);
          const cov = this.dimCoverage(d);
          return '<div class="dim-bar">'
            + '<div class="dim-bar-head"><span>' + esc(d.name) + '</span>'
            + (cov ? '<span class="ev-tag ' + cov.tag + '">' + cov.text + "</span>" : "")
            + '<small>权重 ' + w + '</small><b>' + sc + '</b></div>'
            + '<div class="dim-bar-track"><i style="width:' + pct + '%"></i></div>'
            + "</div>";
        }).join("")
        + "</div>";
    },

    /** 维度级证据覆盖标签（命中<90% 显示"覆盖 xx%"） */
    dimCoverage(d) {
      const ev = getEvidence();
      if (!ev || !d || !d.children) return "";
      let total = 0, missing = 0;
      (d.children || []).forEach(function (c) {
        total += (c.detail || []).length;
        (c.detail || []).forEach(function (l) { if (l.missing) missing++; });
      });
      if (!total) return "";
      const pct = ev.coverage(missing, total);
      if (pct === 100) return { text: "证据完善", tag: "ev-documented" };
      if (pct >= 90) return { text: "覆盖 " + pct + "%", tag: "ev-discovered" };
      if (pct >= 70) return { text: "覆盖 " + pct + "%", tag: "ev-inferred" };
      return { text: "覆盖 " + pct + "% · 建议核验", tag: "ev-missing" };
    },

    /**
     * 逐维度得分依据：一级指标得分 + 二级指标明细（含缺失标注与证据标签）
     */
    renderDims(result) {
      const dims = result.dims || [];
      const ev = getEvidence();
      return '<div class="report-dims">'
        + dims.map((d) => {
          const sub = (d.children || []).map((c) => {
            const leaves = (c.detail || []).map((leaf) => {
              const miss = leaf.missing ? ' class="miss" title="缺失降权"' : "";
              const raw = leaf.raw === null || leaf.raw === undefined ? "--" : esc(leaf.raw) + (leaf.unit ? " " + esc(leaf.unit) : "");
              const sc = leaf.score === null ? "--" : leaf.score.toFixed(1);
              // 证据类型标签（来源标注 + 是否缺失）
              let evTag = "";
              if (ev) {
                const src = leaf.source || c.source || d.source || "";
                const type = ev.typeOf(src, !leaf.missing);
                evTag = ev.labelHTML(type);
              }
              return '<div class="leaf"' + miss + '><span class="leaf-name">' + esc(leaf.name) + "</span><span class=\"leaf-raw\">" + raw + "</span>" + evTag + '<span class="leaf-score">' + sc + "</span></div>";
            }).join("");
            const csc = c.score === null ? "—" : c.score.toFixed(1);
            return '<div class="child"><div class="child-head"><b>' + esc(c.name) + '</b><span class="child-score">' + csc + '</span><small>' + this.comment(c.score) + "</small></div>"
              + '<div class="leaf-list">' + leaves + "</div></div>";
          }).join("");
          const cov = this.dimCoverage(d);
          return '<div class="dim-block"><div class="dim-head"><b>' + esc(d.name) + '</b>'
            + '<span class="dim-score">' + (d.score === null ? "—" : d.score.toFixed(1)) + '</span>'
            + (cov ? '<span class="ev-tag ' + cov.tag + '">' + cov.text + "</span>" : "")
            + '<small>' + this.comment(d.score) + "</small></div>"
            + sub
            + "</div>";
        }).join("")
        + "</div>";
    },

    /**
     * 分析：优势项 TOP3 / 风险项 / 改进建议
     */
    analyze(result) {
      const dims = result.dims || [];
      // 展平所有二级指标
      const leaves = [];
      dims.forEach((d) => {
        (d.children || []).forEach((c) => {
          (c.detail || []).forEach((leaf) => {
            leaves.push({ name: leaf.name, score: leaf.score, missing: leaf.missing, dimName: d.name });
          });
        });
      });
      const scored = leaves.filter((l) => !l.missing && l.score !== null);
      const sorted = scored.slice().sort((a, b) => b.score - a.score);
      const top = sorted.slice(0, 3);
      // 风险：得分 < 55 的二级指标（升序取前 5）
      const risks = sorted.filter((l) => l.score < 55).slice().sort((a, b) => a.score - b.score).slice(0, 5);
      return { top, risks, dims };
    },

    /**
     * 生成改进建议（依据低分维度，给出针对性建议）
     */
    renderSuggestions(result, risks) {
      if (!risks || !risks.length) {
        return '<div class="sugg"><h4>改进建议</h4><p class="ok">各项指标整体健康，建议保持现有经营策略，持续跟踪变化。</p></div>';
      }
      const tips = {
        "财务": "优化现金流与偿债结构，控制负债率，提高资产周转效率",
        "经营": "聚焦主业收入质量，稳定经营规模与毛利率",
        "治理": "完善公司治理与股权结构，强化合规与信息披露",
        "行业": "关注行业周期与政策变化，评估市场空间与竞争格局",
        "团队": "补齐核心团队短板，加强技术与管理人才储备",
        "技术": "加大研发投入，提升核心技术壁垒与知识产权布局",
        "风险": "建立动态风险监测机制，及时处置高波动与负面信号",
      };
      const hits = [];
      risks.forEach((r) => {
        const t = tips[r.dimName];
        if (t && hits.indexOf(t) < 0) hits.push(t);
      });
      const items = hits.length
        ? hits.map((h) => "<li>" + esc(h) + "</li>").join("")
        : risks.slice(0, 3).map((r) => "<li>针对「" + esc(r.name) + "」制定专项改进计划，设定季度目标并跟踪。</li>").join("");
      return '<div class="sugg"><h4>改进建议</h4><ul>' + items + "</ul></div>";
    },

    /**
     * 主入口：渲染完整报告
     */
    renderReport(result, containerId) {
      const el = document.getElementById(containerId);
      if (!el) return;
      if (!result) { el.innerHTML = '<p class="empty-tip">暂无报告数据</p>'; return; }
      const ana = this.analyze(result);

      const topHtml = ana.top.length
        ? ana.top.map((t) => '<div class="chip chip-top">' + esc(t.name) + " · " + t.score.toFixed(1) + "</div>").join("")
        : '<p class="empty-tip">有效指标不足，无法提炼优势项</p>';

      const riskHtml = ana.risks.length
        ? ana.risks.map((r) => '<div class="risk-item"><b>' + esc(r.name) + '</b><span>所属：' + esc(r.dimName) + '</span><i>' + r.score.toFixed(1) + ' 分</i><small>' + this.comment(r.score) + "</small></div>").join("")
        : '<p class="ok">未发现突出风险项（二级指标得分均 ≥ 55）</p>';

      el.innerHTML =
        this.renderHeader(result)
        + '<div class="report-block"><h4>各维度得分</h4>' + this.renderDimBars(result) + "</div>"
        + '<div class="report-grid">'
        + '<div class="report-block"><h4>✅ 优势项 TOP3</h4>' + topHtml + "</div>"
        + '<div class="report-block"><h4>⚠️ 风险提示</h4>' + riskHtml + "</div>"
        + "</div>"
        + this.renderSuggestions(result, ana.risks)
        + '<div class="report-block"><h4>逐维度得分依据</h4>' + this.renderDims(result) + "</div>"
        + '<p class="report-note">评估方法：最小最大线性标准化 + 三层加权聚合 + 缺失降权（复刻自中金资本智能投决·多维数智企评平台 V3.4，本地离线运行）。'
        + '证据分类：Documented 文档直接支撑 · Discovered 数据发现 · Inferred 推断得出（需人工确认） · Missing 数据缺失（已自动降权）。'
        + '置信度由数据覆盖率推导（≥90% 高 / ≥70% 中 / 其余 低）。</p>';
    },
  };

  // 暴露到全局（含别名）
  QB_REPORT.render = QB_REPORT.renderReport;
  global.QB_REPORT = QB_REPORT;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = QB_REPORT;
  }
})(typeof window !== "undefined" ? window : globalThis);