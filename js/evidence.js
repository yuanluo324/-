/**
 * 企评小宝 · 证据链与可信度分层（evidence.js）
 *
 * 依据《企业评估交互端全栈方案设计》4.3 证据链查看器落地：
 *   每条评估结论必须挂载证据来源并标注置信度。
 *
 * 证据类型分层（参考 Sieve IMPACT-X / Wallstreet Tieling）：
 *   Documented —— 有文档直接支撑（指标库 source 标注 [PDF公开] 等）
 *   Discovered —— 从数据中发现（来源未显式标注但属于采集数据）
 *   Inferred   —— 推断得出（指标库 source 标注 [推演补齐]，需人工确认）
 *   Missing    —— 数据缺失（该指标无可用证据，报告中给出核验方向）
 *
 * 置信度：由数据覆盖率推导（覆盖 >= 90% 高 / >= 70% 中 / 其余 低）。
 * 纯前端离线实现，与 indicators.js 的 source 标注联动。
 *
 * 接口：
 *   QB_EVIDENCE.types                       —— 四类证据类型定义（label/zh/cls）
 *   QB_EVIDENCE.typeOf(source, hasValue)    —— 由来源标注判定证据类型
 *   QB_EVIDENCE.labelHTML(type)             —— 渲染证据标签
 *   QB_EVIDENCE.coverage(missing,total)     —— 数据覆盖率 [0,100]
 *   QB_EVIDENCE.confidence(missing,total)   —— 置信度等级 高/中/低
 *   QB_EVIDENCE.summarize(result)           —— 统计报告内四类证据计数与覆盖率
 */

(function (global) {
  "use strict";

  const EVIDENCE_TYPES = {
    documented: { key: "documented", label: "Documented", zh: "文档直接支撑", cls: "ev-documented", hint: "有文档直接支撑（公开来源）" },
    discovered: { key: "discovered", label: "Discovered", zh: "数据发现", cls: "ev-discovered", hint: "从采集数据中发现" },
    inferred: { key: "inferred", label: "Inferred", zh: "推断得出", cls: "ev-inferred", hint: "依方案推演补齐，需人工确认" },
    missing: { key: "missing", label: "Missing", zh: "数据缺失", cls: "ev-missing", hint: "该指标无可用证据，建议核验" },
  };

  /** 由指标 source 标注与是否有值判定证据类型 */
  function typeOf(source, hasValue) {
    if (!hasValue) return EVIDENCE_TYPES.missing;
    if (!source) return EVIDENCE_TYPES.discovered;
    if (source.indexOf("推演") >= 0) return EVIDENCE_TYPES.inferred;
    if (source.indexOf("PDF") >= 0 || source.indexOf("公开") >= 0) return EVIDENCE_TYPES.documented;
    return EVIDENCE_TYPES.discovered;
  }

  /** 渲染证据标签 HTML */
  function labelHTML(type) {
    const t = type || EVIDENCE_TYPES.missing;
    return '<span class="ev-tag ' + t.cls + '" title="' + t.hint + '">' + t.label + " · " + t.zh + "</span>";
  }

  /** 数据覆盖率 [0,100] */
  function coverage(missing, total) {
    if (!total) return 0;
    const c = Math.round(((total - (missing || 0)) / total) * 100);
    return Math.max(0, Math.min(100, c));
  }

  /** 置信度等级 */
  function confidence(missing, total) {
    const c = coverage(missing, total);
    if (c >= 90) return "高";
    if (c >= 70) return "中";
    return "低";
  }

  /**
   * 对一次评分结果做证据统计：
   * 遍历 result.dims[].children[].detail，按 leaf.missing 与父级 source 归类。
   * @returns {{documented,discovered,inferred,missing,total,coverage,confidence}}
   */
  function summarize(result) {
    const stat = { documented: 0, discovered: 0, inferred: 0, missing: 0, total: 0 };
    if (!result || !Array.isArray(result.dims)) return fill(stat);
    result.dims.forEach(function (d) {
      (d.children || []).forEach(function (c) {
        const src = c.source || d.source || "";
        (c.detail || []).forEach(function (leaf) {
          stat.total++;
          const t = typeOf(src, !leaf.missing);
          stat[t.key]++;
        });
      });
    });
    return fill(stat);
  }

  function fill(stat) {
    stat.total = stat.documented + stat.discovered + stat.inferred + stat.missing;
    stat.coverage = coverage(stat.missing, stat.total);
    stat.confidence = confidence(stat.missing, stat.total);
    return stat;
  }

  const QB_EVIDENCE = {
    types: EVIDENCE_TYPES,
    typeOf: typeOf,
    labelHTML: labelHTML,
    coverage: coverage,
    confidence: confidence,
    summarize: summarize,
  };

  global.QB_EVIDENCE = QB_EVIDENCE;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = QB_EVIDENCE;
  }
})(typeof window !== "undefined" ? window : globalThis);