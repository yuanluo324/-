/**
 * 企评小宝 · 评分引擎（engine.js）
 *
 * 复刻自中金资本智能投决·多维数智企评平台（V3.4 PDF）评分方法：
 *   正向指标  x_norm = (x - x_min) / (x_max - x_min)
 *   负向指标  x_norm = 1 - (x - x_min) / (x_max - x_min)
 *   得分范围 [0,1] 扩大 100 倍，保留两位小数
 *
 * 评分流程（三层加权 + 总分）：
 *   二级指标标准化得分 → 按权重求和得一级指标得分
 *   一级指标按权重求和得维度得分
 *   维度按场景权重求和得总分
 *
 * 缺失值降权：当某指标的 value 缺失（undefined/null/空字符串/NaN）时，
 *   该指标权重在所在层的分子分母中一并扣除，不因缺失拉低整体分。
 *   允许用户传入自定义权重：{ scenario: "custom", weights: {d1:..,d7:..} }
 */

(function (global) {
  "use strict";

  // 环境自适应：浏览器取全局 QB_INDICATORS，Node 环境 require（仅本文件，不污染浏览器加载）
  const QB_INDICATORS =
    (typeof global.QB_INDICATORS !== "undefined")
      ? global.QB_INDICATORS
      : (typeof module !== "undefined" ? require("./indicators.js") : {});

  const QB_ENGINE = {
    /** 取指标配置，平铺为 {id->indicator} 映射 */
    buildIndex() {
      const map = {};
      QB_INDICATORS.dimensions.forEach((d) => {
        d.children.forEach((c) => {
          c.children.forEach((i) => {
            map[i.id] = { dimensionId: d.id, parentId: c.id, ...i };
          });
        });
      });
      return map;
    },

    /**
     * 最小最大线性标准化
     * @param {number} value 原始值
     * @param {object} indicator 指标配置（含 direction / reference）
     * @returns {number|null} 标准化得分 [0,100]，无法计算时返回 null
     */
    normalize(value, indicator) {
      if (value === undefined || value === null || value === "") return null;
      const v = Number(value);
      if (Number.isNaN(v)) return null;
      const ref = indicator.reference || { min: 0, max: 100 };
      const denom = ref.max - ref.min;
      if (denom === 0) return 100; // 区间退化，给满分（避免除零）
      let x = (v - ref.min) / denom;
      if (indicator.direction === "negative") x = 1 - x;
      x = Math.max(0, Math.min(1, x)); // 钳制到 [0,1]
      return Math.round(x * 10000) / 100; // 扩大100倍，保留两位
    },

    /**
     * 计算某二级指标集合的加权得分（缺缺失项降权）
     * @param {Array} items 二级指标配置数组
     * @param {Object} values 指标值映射 {id: value}
     * @param {Object} index 指标索引
     * @returns {{score:number|null, covered:number, detail:Array}}
     */
    scoreLevel1(items, values, index) {
      let wSum = 0;
      let sSum = 0;
      const detail = [];
      items.forEach((it) => {
        const w = typeof it.weight === "number" ? it.weight : 1;
        const raw = values[it.id];
        const norm = this.normalize(raw, it);
        detail.push({
          id: it.id,
          name: it.name,
          raw: (raw === undefined || raw === null || raw === "") ? null : Number(raw),
          unit: it.unit,
          direction: it.direction,
          weight: w,
          score: norm,
          missing: norm === null,
          source: it.source, // 透传来源标注（[PDF公开]/[推演补齐]），供报告证据链归类
        });
        if (norm !== null) {
          wSum += w;
          sSum += w * norm;
        }
      });
      return { score: wSum > 0 ? sSum / wSum : null, covered: wSum, detail };
    },

    /**
     * 计算某维度得分（一级指标加权，一级得分缺失项降权）
     * @param {Object} dimension 维度配置
     * @param {Object} values
     * @param {Object} index
     */
    scoreDimension(dimension, values, index) {
      let cWSum = 0; // 一级权重（默认按二级权重之和，或一级自身 weight）
      let cSSum = 0;
      const children = [];
      dimension.children.forEach((c) => {
        const l1 = this.scoreLevel1(c.children, values, index);
        const cWeight = (typeof c.weight === "number")
          ? c.weight
          : (l1.covered > 0 ? l1.covered : 0); // 一级权重=其下二级权重和
        children.push({
          id: c.id,
          name: c.name,
          desc: c.desc,
          source: c.source,
          weight: cWeight,
          ...l1,
        });
        if (cWeight > 0 && l1.score !== null) {
          cWSum += cWeight;
          cSSum += cWeight * l1.score;
        }
      });
      return { score: cWSum > 0 ? cSSum / cWSum : null, covered: cWSum, children };
    },

    /**
     * 计算企业总分
     * @param {Object|null} values 指标值映射 {id: 数值}
     * @param {string|Object} scenario 场景id（investment/diligence/job/cooperation）
     *        或 {name, weights:{d1:..,d7:..}} 自定义权重对象；缺省用 investment
     * @returns {{
     *   total: number|null,          总分 [0,100]
     *   dims: Array<{id,name,desc,score,covered,children}>,
     *   weights: Object,             实际采用的维度权重
     *   scenarioName: string,
     *   missingCount: number,        缺失指标数
     *   totalCount: number           指标总数
     * }}
     */
    score(values, scenario) {
      if (!values || typeof values !== "object") values = {};

      // 解析场景权重
      let scenarioName = "投资参考";
      let weights = null;
      if (typeof scenario === "object" && scenario && scenario.weights) {
        scenarioName = scenario.name || "自定义权重";
        weights = scenario.weights;
      } else {
        const sId = scenario || "investment";
        const sc = QB_INDICATORS.scenarios[sId];
        if (sc) {
          scenarioName = sc.name;
          weights = sc.weights;
        } else {
          scenarioName = QB_INDICATORS.scenarios.investment.name;
          weights = QB_INDICATORS.scenarios.investment.weights;
        }
      }

      const index = this.buildIndex();
      const dims = [];
      let wTotal = 0;
      let sTotal = 0;
      let missingCount = 0;

      QB_INDICATORS.dimensions.forEach((d) => {
        const dim = this.scoreDimension(d, values, index);
        const dimWeight = typeof weights[d.id] === "number" ? weights[d.id] : 0;
        dim.weight = dimWeight;
        dims.push({ id: d.id, name: d.name, desc: d.desc, source: d.source, ...dim });
        if (dimWeight > 0 && dim.score !== null) {
          wTotal += dimWeight;
          sTotal += dimWeight * dim.score;
        }
      });

      // 统计缺失数
      const flat = QB_INDICATORS.flatten();
      totalCount: for (let i = 0; i < flat.length; i++) {
        const v = values[flat[i].id];
        if (v === undefined || v === null || v === "" || Number.isNaN(Number(v))) missingCount++;
      }

      // 归一化权重（避免部分维度缺失导致权重和<1带来的总分偏低）
      const total = wTotal > 0 ? (sTotal / wTotal) : null;

      return {
        total: total !== null ? Math.round(total * 100) / 100 : null,
        dims,
        weights,
        scenarioName,
        missingCount,
        totalCount: flat.length,
      };
    },

    /** 生成一份「全空值」初始 values（用于表单初始化） */
    emptyValues() {
      const v = {};
      QB_INDICATORS.flatten().forEach((i) => { v[i.id] = null; });
      return v;
    },
  };

  // 兼容浏览器与 Node
  global.QB_ENGINE = QB_ENGINE;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = QB_ENGINE;
  }
})(typeof window !== "undefined" ? window : globalThis);