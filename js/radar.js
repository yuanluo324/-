/**
 * 企评小宝 · 雷达图模块（radar.js）
 *
 * 纯 SVG 本地绘制，离线可用、无外部依赖。
 * 接口：
 *   QB_RADAR.renderRadar(dims, containerId, result?)   —— 7 维度单企业雷达图
 *   QB_RADAR.renderCompare(series, containerId)        —— 多企业对比雷达图
 *
 * dims: [{id, name, score, covered}]，score 为 0-100 的维度得分；null 视为缺失。
 * series: [{name, color?, dims: [...]}]
 */

(function (global) {
  "use strict";

  const QB_RADAR = {
    // 固定 7 维配色（与维度 id 顺序无关，仅用于对比系列）
    PALETTE: ["#2f6bff", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316"],

    /**
     * 生成单企业雷达图 SVG 字符串
     * @param {Array} dims 维度数组 [{id,name,score}]
     * @param {string} title 图标题
     * @returns {string} SVG
     */
    buildRadarSVG(dims, title) {
      const size = 460;          // viewBox 尺寸
      const cx = 230, cy = 216;  // 圆心
      const R = 148;             // 最大半径
      const W = 460, H = 470;    // 总画布（下方留图例区）

      const n = dims.length || 7;
      // 从正上方开始顺时针均分
      const angle = (i) => (-Math.PI / 2) + (i * 2 * Math.PI) / n;
      const px = (i, r) => (cx + r * Math.cos(angle(i))).toFixed(1);
      const py = (i, r) => (cy + r * Math.sin(angle(i))).toFixed(1);

      const parts = [];
      parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + (title || "维度雷达图") + '">');
      parts.push('<rect width="' + W + '" height="' + H + '" fill="#ffffff" rx="12"/>');

      // 背景网格：5 圈同心多边形
      for (let g = 1; g <= 5; g++) {
        const r = (R * g) / 5;
        const pts = [];
        for (let i = 0; i < n; i++) pts.push(px(i, r) + "," + py(i, r));
        parts.push('<polygon points="' + pts.join(" ") + '" fill="none" stroke="#e2e8f0" stroke-width="1"/>');
      }
      // 轴线
      for (let i = 0; i < n; i++) {
        parts.push('<line x1="' + cx + '" y1="' + cy + '" x2="' + px(i, R) + '" y2="' + py(i, R) + '" stroke="#e2e8f0" stroke-width="1"/>');
      }
      // 网格数值标注（0/20/40/60/80/100）
      for (let g = 1; g <= 5; g++) {
        const v = g * 20;
        const r = (R * g) / 5;
        parts.push('<text x="' + (cx + 4) + '" y="' + (cy - r + 4) + '" font-size="12" fill="#94a3b8">' + v + '</text>');
      }

      // 数据多边形（缺失维度按 0 处理并在顶点标注）
      const hasAny = dims.some((d) => typeof d.score === "number" && !Number.isNaN(d.score));
      if (hasAny) {
        const pts = [];
        for (let i = 0; i < n; i++) {
          const sc = dims[i] && typeof dims[i].score === "number" && !Number.isNaN(dims[i].score)
            ? Math.max(0, Math.min(100, dims[i].score)) : 0;
          pts.push(px(i, (R * sc) / 100) + "," + py(i, (R * sc) / 100));
        }
        parts.push('<polygon points="' + pts.join(" ") + '" fill="rgba(47,107,255,0.22)" stroke="#2f6bff" stroke-width="2.2" stroke-linejoin="round"/>');
        // 顶点圆点
        for (let i = 0; i < n; i++) {
          const sc = dims[i] && typeof dims[i].score === "number" && !Number.isNaN(dims[i].score)
            ? Math.max(0, Math.min(100, dims[i].score)) : 0;
          const r = (R * sc) / 100;
          parts.push('<circle cx="' + px(i, r) + '" cy="' + py(i, r) + '" r="3.6" fill="#2f6bff"/>');
          parts.push('<text x="' + px(i, r + (r > 0 ? 0 : 12)) + '" y="' + (py(i, r) - 8) + '" font-size="13" font-weight="700" fill="#1e3a8a" text-anchor="middle">'
            + (typeof dims[i].score === "number" && !Number.isNaN(dims[i].score) ? dims[i].score.toFixed(0) : "—") + '</text>');
        }
      } else {
        parts.push('<text x="' + cx + '" y="' + cy + '" font-size="15" fill="#94a3b8" text-anchor="middle">暂无数据可绘制</text>');
      }

      // 维度标签（轴末端外侧）
      for (let i = 0; i < n; i++) {
        const d = dims[i] || {};
        const label = (d.name || ("维度" + (i + 1))) + (typeof d.score !== "number" ? " *" : "");
        const a = angle(i);
        const lx = cx + (R + 22) * Math.cos(a);
        const ly = cy + (R + 22) * Math.sin(a);
        const anchor = Math.abs(Math.cos(a)) < 0.3 ? "middle" : (Math.cos(a) > 0 ? "start" : "end");
        parts.push('<text x="' + lx.toFixed(1) + '" y="' + (ly + 4).toFixed(1) + '" font-size="14" font-weight="600" fill="#334155" text-anchor="' + anchor + '">' + label + '</text>');
      }

      // 标题
      if (title) {
        parts.push('<text x="' + cx + '" y="26" font-size="16" font-weight="700" fill="#123a8c" text-anchor="middle">' + title + '</text>');
      }
      // 缺失注明
      if (dims.some((d) => typeof d.score !== "number")) {
        parts.push('<text x="' + cx + '" y="' + (H - 8) + '" font-size="12" fill="#f59e0b" text-anchor="middle">* 该维度数据缺失，按 0 计入图形（评分已降权）</text>');
      }
      parts.push("</svg>");
      return parts.join("\n");
    },

    /**
     * 生成多企业对比雷达图 SVG
     * @param {Array} series [{name, color, dims:[{name,score}]}]
     * @returns {string} SVG
     */
    buildCompareSVG(series) {
      const n = (series.length && series[0] && series[0].dims.length) || 0;
      if (!n) return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 470"><rect width="460" height="470" fill="#fff" rx="12"/><text x="230" y="235" font-size="15" fill="#94a3b8" text-anchor="middle">暂无对比数据</text></svg>';

      const W = 460, H = 470;
      const cx = 230, cy = 216;
      const R = 148;
      const angle = (i) => (-Math.PI / 2) + (i * 2 * Math.PI) / n;
      const px = (i, r) => (cx + r * Math.cos(angle(i))).toFixed(1);
      const py = (i, r) => (cy + r * Math.sin(angle(i))).toFixed(1);

      const parts = [];
      parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="多企业对比雷达图">');
      parts.push('<rect width="' + W + '" height="' + H + '" fill="#ffffff" rx="12"/>');

      for (let g = 1; g <= 5; g++) {
        const r = (R * g) / 5;
        const pts = [];
        for (let i = 0; i < n; i++) pts.push(px(i, r) + "," + py(i, r));
        parts.push('<polygon points="' + pts.join(" ") + '" fill="none" stroke="#e2e8f0" stroke-width="1"/>');
      }
      for (let i = 0; i < n; i++) {
        parts.push('<line x1="' + cx + '" y1="' + cy + '" x2="' + px(i, R) + '" y2="' + py(i, R) + '" stroke="#e2e8f0" stroke-width="1"/>');
      }

      series.forEach((s, si) => {
        const color = s.color || this.PALETTE[si % this.PALETTE.length];
        const pts = [];
        for (let i = 0; i < n; i++) {
          const d = s.dims[i] || {};
          const sc = typeof d.score === "number" && !Number.isNaN(d.score) ? Math.max(0, Math.min(100, d.score)) : 0;
          pts.push(px(i, (R * sc) / 100) + "," + py(i, (R * sc) / 100));
        }
        parts.push('<polygon points="' + pts.join(" ") + '" fill="' + color + '" fill-opacity="0.10" stroke="' + color + '" stroke-width="2" stroke-dasharray="' + (si > 0 ? "5 3" : "none") + '" stroke-linejoin="round"/>');
      });

      for (let i = 0; i < n; i++) {
        const label = (series[0].dims[i] && series[0].dims[i].name) || ("维度" + (i + 1));
        const a = angle(i);
        const lx = cx + (R + 22) * Math.cos(a);
        const ly = cy + (R + 22) * Math.sin(a);
        const anchor = Math.abs(Math.cos(a)) < 0.3 ? "middle" : (Math.cos(a) > 0 ? "start" : "end");
        parts.push('<text x="' + lx.toFixed(1) + '" y="' + (ly + 4).toFixed(1) + '" font-size="14" font-weight="600" fill="#334155" text-anchor="' + anchor + '">' + label + '</text>');
      }

      // 图例
      let ly = H - 26;
      parts.push('<text x="12" y="' + (ly - 4) + '" font-size="13" font-weight="700" fill="#334155">图例：</text>');
      let lx = 52;
      series.forEach((s, si) => {
        const color = s.color || this.PALETTE[si % this.PALETTE.length];
        parts.push('<rect x="' + lx + '" y="' + (ly - 34) + '" width="14" height="14" fill="' + color + '" opacity="0.65" rx="3"/>');
        parts.push('<text x="' + (lx + 18) + '" y="' + (ly - 22) + '" font-size="13" fill="#334155">' + s.name + '</text>');
        lx += 18 + 14 + s.name.length * 14 + 18;
      });
      parts.push("</svg>");
      return parts.join("\n");
    },

    /**
     * 渲染单企业雷达图到容器
     * @param {Array} dims  维度得分数组（引擎 result.dims）
     * @param {string} containerId 容器 id
     * @param {object} result 评分结果（可选，用于标题）
     */
    renderRadar(dims, containerId, result) {
      const el = document.getElementById(containerId);
      if (!el) return;
      const list = (dims || []).map((d) => ({ id: d.id, name: d.name, score: d.score }));
      const title = result && result.companyName ? result.companyName + " · 维度画像" : "维度画像";
      el.innerHTML = this.buildRadarSVG(list, title);
    },

    /**
     * 渲染多企业对比雷达图到容器
     * @param {Array} series [{name, dims:[{name,score}]}]
     * @param {string} containerId
     */
    renderCompare(series, containerId) {
      const el = document.getElementById(containerId);
      if (!el) return;
      el.innerHTML = this.buildCompareSVG(series || []);
    },
  };

  global.QB_RADAR = QB_RADAR;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = QB_RADAR;
  }
})(typeof window !== "undefined" ? window : globalThis);