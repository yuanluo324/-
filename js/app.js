/**
 * 企评小宝 · 应用主流程（app.js）
 *
 * 流程：对话式输入（企业名 + 评估视角）→ 公开数据录入（预置示例可编辑）
 *      → 用户补充填报（指标表单）→ 触发评分 → 结果展示（雷达图 + 报告 + 历史）
 *
 * 集成《企业评估交互端全栈方案设计》：
 *   - 4.2 多视角切换：四张视角卡（投资/尽调/求职/合作）互斥卡片驱动评估视角
 *   - Shell 步骤条：随流程推进激活（视角→录入→报告）
 *   - 5.2 自定义权重配置：弹窗调整 7 维度权重，归一化后传入评分引擎
 *   - 4.3 证据链：字段来源标注语文化（Documented/Discovered/Missing）
 *
 * 依赖：indicators.js / evidence.js / engine.js / samples.js / radar.js / report.js / history.js
 */

(function (global) {
  "use strict";

/** HTML 转义（AI 文本渲染安全） */
  function escText(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) {
      if (m === "&") return "&amp;";
      if (m === "<") return "&lt;";
      if (m === ">") return "&gt;";
      if (m === '"') return "&quot;";
      return "&#39;";
    });
  }

  /** 视角卡语义映射（key 与 indicators.js scenarios 对齐） */
  const PERSPECTIVES = {
    investment: { icon: "📈", name: "投资视角", core: "这是一笔好投资吗？", focus: "增长性 > 盈利性 > 治理" },
    diligence: { icon: "🔍", name: "尽调视角", core: "公司健康度如何？", focus: "财务健康 > 治理规范 > 风险" },
    job: { icon: "🧑‍💻", name: "求职视角", core: "我应该在这里工作吗？", focus: "团队成长 > 财务稳健 > 文化" },
    cooperation: { icon: "🤝", name: "合作视角", core: "这家公司值得合作吗？", focus: "信誉合规 > 生态 > 履约" },
  };

  const QB_APP = {
    /** 当前上下文 */
    state: {
      companyName: "",
      scenarioKey: "investment",
      customWeights: null, // 用户自定义维度权重 {d1..d7}
      values: {},          // 合并后的指标值（公开 + 用户补充）
      lastResult: null,    // 最近一次评分结果
      aiInsight: null,     // AI 解读结果 {ok, summary, strengths[], risks[], suggestions[], conclusion}
      aiInsightLoading: false, // AI 解读请求中
      aiSearch: null,          // AI 参数检索结果 {ok, summary, dimensions[], missing[]}
      aiSearchLoading: false,  // AI 参数检索请求中
    },

    $: function (id) { return document.getElementById(id); },

    /** 初始化：绑定事件、渲染视角卡与各功能入口 */
    init() {
      // 评估视角：由 perspective-grid 四张互斥卡片唯一承载（scenario-select 已移除）
      this.renderPerspectives();

      // 事件
      this.$("btn-start").addEventListener("click", () => this.onStart());
      this.$("company-name").addEventListener("keydown", (e) => { if (e.key === "Enter") this.onStart(); });
      this.$("btn-score").addEventListener("click", () => this.onScore());
      this.$("sample-select").addEventListener("change", (e) => this.onSampleChange(e.target.value));
      this.$("btn-compare").addEventListener("click", () => this.toggleHistory());

      // 回到首页（数据录入 / 评估结果 / 历史对比三视图统一入口）
      const hd = this.$("btn-home-from-data");
      if (hd) hd.addEventListener("click", () => this.goHome());
      const hr = this.$("btn-home-from-result");
      if (hr) hr.addEventListener("click", () => this.goHome());
      const hh = this.$("btn-home-from-history");
      if (hh) hh.addEventListener("click", () => this.goHome());
      const closeHistory = this.$("btn-close-history");
      if (closeHistory) closeHistory.addEventListener("click", () => { this.$("step-history").classList.add("hidden"); });

      // 顶部栏「首页」按钮：与回到首页行为一致（切回第一步并复位步骤条）
      const ht = this.$("btn-home-top");
      if (ht) ht.addEventListener("click", (e) => {
        e.preventDefault();
        this.goHome();
      });

      // 自定义权重弹窗
      this.$("btn-weights").addEventListener("click", () => this.openWeights());
      this.$("cw-apply").addEventListener("click", () => this.applyWeights());
      this.$("cw-reset").addEventListener("click", () => this.resetWeights());
      this.$("cw-cancel").addEventListener("click", () => this.closeWeights());
      this.$("cw-overlay").addEventListener("click", (e) => { if (e.target === this.$("cw-overlay")) this.closeWeights(); });

      // AI 设置弹窗（设计方案：AI 增强而非替代，密钥用户自持）
      this.$("btn-ai-settings").addEventListener("click", () => this.openAISettings());
      this.$("ai-btn-save").addEventListener("click", () => this.saveAISettings());
      this.$("ai-btn-test").addEventListener("click", () => this.testAI());
      this.$("ai-btn-clear").addEventListener("click", () => this.clearAISettings());
      this.$("ai-btn-cancel").addEventListener("click", () => this.closeAISettings());
      this.$("ai-overlay").addEventListener("click", (e) => { if (e.target === this.$("ai-overlay")) this.closeAISettings(); });

      // 设置面板（顶栏 ⚙ 设置：风格 / 历史 / AI 密钥）
      const btnSettings = this.$("btn-settings");
      if (btnSettings) btnSettings.addEventListener("click", () => this.openSettings());
      const settingsClose = this.$("settings-close");
      if (settingsClose) settingsClose.addEventListener("click", () => this.closeSettings());
      const settingsOverlay = this.$("settings-overlay");
      if (settingsOverlay) settingsOverlay.addEventListener("click", (e) => { if (e.target === settingsOverlay) this.closeSettings(); });
      const btnClearHistory = this.$("btn-clear-history");
      if (btnClearHistory) btnClearHistory.addEventListener("click", () => this.clearHistory());
      const themeSelect = this.$("theme-select");
      if (themeSelect) themeSelect.addEventListener("change", () => this.saveTheme());

      // 设置面板 AI 密钥表单（#s- 前缀，与 #ai- 共用同一存储 qpb_ai_config）
      const sSave = this.$("s-ai-save");
      if (sSave) sSave.addEventListener("click", () => this.saveAISettingsFromSettings());
      const sClear = this.$("s-ai-clear");
      if (sClear) sClear.addEventListener("click", () => this.clearAISettingsFromSettings());
      const sTest = this.$("s-ai-test");
      if (sTest) sTest.addEventListener("click", () => this.testAIFromSettings());
      const autoSearch = this.$("s-ai-autosearch");
      if (autoSearch) autoSearch.addEventListener("change", (e) => {
        try { localStorage.setItem("qpb_ai_autosearch", e.target.checked ? "1" : "0"); } catch (err) { /* 忽略 */ }
      });

      // 顶栏全局搜索栏（套壳复用 company-name + sample-select）
      const topBtn = this.$("top-search-btn");
      if (topBtn) topBtn.addEventListener("click", () => this.topSearch());
      const topInput = this.$("top-search-input");
      if (topInput) topInput.addEventListener("keydown", (e) => { if (e.key === "Enter") this.topSearch(); });

      // Tab 切换
      document.querySelectorAll(".tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
          this.$(btn.dataset.tab).classList.remove("hidden");
        });
      });

      // 示例下拉
      const sampleSel = this.$("sample-select");
      QB_SAMPLES.forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.name;
        sampleSel.appendChild(opt);
      });

      // 评估方法与流程可视化（若 visualize.js 已加载）
      if (global.QB_VISUAL && typeof global.QB_VISUAL.init === "function") {
        global.QB_VISUAL.init();
      }

      // 应用已保存的界面主题（默认 light）与自动检索开关
      let savedTheme = "light";
      try { savedTheme = localStorage.getItem("qpb_theme") || "light"; } catch (e) { /* 忽略 */ }
      this.applyTheme(savedTheme);
      const autoSearchOn = this._aiAutoSearchOn();
      console.log("[企评小宝] AI 自动检索 " + (autoSearchOn ? "已开启" : "未开启"));
      console.log("[企评小宝] 应用初始化完成");
    },

    /* ========== 多视角卡片（设计方案 4.2） ========== */

    /** 渲染四视角卡片并绑定点击 */
    renderPerspectives() {
      const grid = this.$("perspective-grid");
      if (!grid) return;
      grid.innerHTML = "";
      const keys = Object.keys(QB_INDICATORS.scenarios).filter((k) => k !== "custom");
      keys.forEach((k) => {
        const meta = PERSPECTIVES[k] || { icon: "◈", name: QB_INDICATORS.scenarios[k].name, core: "该视角下企业表现如何？", focus: "均衡评估" };
        const card = document.createElement("div");
        card.className = "persp-card" + (k === this.state.scenarioKey ? " active" : "");
        card.dataset.persp = k;
        card.innerHTML =
          '<span class="persp-check">✓</span>'
          + '<div class="persp-head"><span class="persp-icon">' + meta.icon + "</span>"
          + '<span class="persp-name">' + meta.name + "</span></div>"
          + '<div class="persp-core">' + meta.core + "</div>"
          + '<span class="persp-focus">侧重 ' + meta.focus + "</span>";
        card.addEventListener("click", () => this.selectPerspective(k));
        grid.appendChild(card);
      });
    },

    /** 选中视角：更新 state 与卡片高亮（scenario-select 已移除，唯一入口为视角卡） */
    selectPerspective(key) {
      this.state.scenarioKey = key;
      document.querySelectorAll(".persp-card").forEach((c) => {
        c.classList.toggle("active", c.dataset.persp === key);
      });
      const hint = this.$("score-hint");
      if (hint) hint.textContent = "已选择场景：" + this.scenarioName() + " · 待录入数据";
    },

    /* ========== 自定义权重弹窗（设计方案 5.2 / P2） ========== */

    /** 打开权重弹窗（预填当前生效权重） */
    openWeights() {
      const list = this.$("cw-list");
      list.innerHTML = "";
      const base = this.state.customWeights
        || (QB_INDICATORS.scenarios[this.state.scenarioKey] || {}).weights
        || {};
      QB_INDICATORS.dimensions.forEach((dim, i) => {
        const row = document.createElement("div");
        row.className = "cw-row";
        const color = (global.QB_VISUAL && QB_VISUAL.PALETTE) ? QB_VISUAL.PALETTE[i % QB_VISUAL.PALETTE.length] : "#2f6bff";
        const val = typeof base[dim.id] === "number" ? base[dim.id].toFixed(2) : "0.00";
        row.innerHTML = '<label><span class="cw-dot" style="background:' + color + '"></span>'
          + dim.name + "</label>"
          + '<input type="number" step="0.01" min="0" max="1" data-dim="' + dim.id + '" value="' + val + '">';
        list.appendChild(row);
      });
      this.$("cw-overlay").classList.remove("hidden");
    },

    /** 应用权重：读取、过滤、归一化后存入 state */
    applyWeights() {
      const raw = {};
      document.querySelectorAll("#cw-list input[data-dim]").forEach((input) => {
        const v = parseFloat(input.value);
        if (!isNaN(v) && v >= 0) raw[input.dataset.dim] = v;
      });
      const sum = Object.keys(raw).reduce((a, k) => a + raw[k], 0);
      if (sum <= 0) {
        alert("权重合计需大于 0");
        return;
      }
      const norm = {};
      Object.keys(raw).forEach((k) => { norm[k] = Number((raw[k] / sum).toFixed(4)); });
      this.state.customWeights = norm;
      this.closeWeights();
      const hint = this.$("score-hint");
      if (hint) hint.textContent = "已应用自定义权重（合计=1）· 场景：" + this.scenarioName() + " · 待录入数据";
    },

    /** 恢复场景默认权重 */
    resetWeights() {
      this.state.customWeights = null;
      this.openWeights();
    },

    closeWeights() {
      this.$("cw-overlay").classList.add("hidden");
    },

    /* ========== AI 设置弹窗与智能解读（设计方案 AI 增强而非替代） ========== */

    /** 打开 AI 设置弹窗（预填已保存配置） */
    openAISettings() {
      const cfg = global.QB_AI ? global.QB_AI.getConfig() : null;
      const def = (global.QB_AI && global.QB_AI.DEFAULT_BASE_URL) ? global.QB_AI.DEFAULT_BASE_URL : "https://api.deepseek.com/v1";
      const defModel = (global.QB_AI && global.QB_AI.DEFAULT_MODEL) ? global.QB_AI.DEFAULT_MODEL : "deepseek-chat";
      this.$("ai-base-url").value = cfg ? cfg.baseUrl : def;
      this.$("ai-api-key").value = cfg ? cfg.apiKey : "";
      this.$("ai-model").value = cfg ? cfg.model : defModel;
      const tr = this.$("ai-test-result");
      tr.classList.add("hidden");
      tr.textContent = "";
      this.$("ai-overlay").classList.remove("hidden");
      if (!cfg) {
        tr.className = "ai-test-result";
        tr.textContent = "当前未配置密钥：评估与报告功能不受影响，仅 AI 解读不可用。";
        tr.classList.remove("hidden");
      }
    },

    closeAISettings() {
      this.$("ai-overlay").classList.add("hidden");
    },

    /** 保存 AI 配置到本机 localStorage */
    saveAISettings() {
      const baseUrl = this.$("ai-base-url").value.trim();
      const apiKey = this.$("ai-api-key").value.trim();
      const model = this.$("ai-model").value.trim();
      const tr = this.$("ai-test-result");
      if (!apiKey) {
        tr.className = "ai-test-result err";
        tr.textContent = "API 密钥不能为空。";
        tr.classList.remove("hidden");
        return;
      }
      if (!global.QB_AI) {
        tr.className = "ai-test-result err";
        tr.textContent = "AI 模块未加载，请检查 js/ai.js 引用。";
        tr.classList.remove("hidden");
        return;
      }
      const ok = global.QB_AI.saveConfig({ baseUrl: baseUrl, apiKey: apiKey, model: model });
      if (ok) {
        this.closeAISettings();
        const hint = this.$("score-hint");
        if (hint) hint.textContent = "AI 配置已保存（仅本机）· 评分后可在报告中一键生成 AI 解读";
        this.renderAIPanel(); // 若已有结果，刷新面板状态
      } else {
        tr.className = "ai-test-result err";
        tr.textContent = "配置保存失败，请重试。";
        tr.classList.remove("hidden");
      }
    },

    /** 清除本机保存的 AI 密钥 */
    clearAISettings() {
      if (global.QB_AI) global.QB_AI.clearConfig();
      this.$("ai-api-key").value = "";
      const tr = this.$("ai-test-result");
      tr.className = "ai-test-result";
      tr.textContent = "已清除本机保存的密钥与配置。";
      tr.classList.remove("hidden");
      this.renderAIPanel();
    },

    /** 测试连接（#ai- 顶部弹窗入口） */
    testAI() {
      this._runAITest(
        this.$("ai-base-url").value.trim(),
        this.$("ai-api-key").value.trim(),
        this.$("ai-model").value.trim(),
        "ai-test-result"
      );
    },

    /** 公共连接测试：临时保存 → 测试 → 恢复原配置（#ai- 与 #s- 两套表单复用） */
    _runAITest(baseUrl, apiKey, model, resultElId) {
      const tr = this.$(resultElId);
      if (!apiKey) {
        tr.className = "ai-test-result err";
        tr.textContent = "请先填写 API 密钥再测试。";
        tr.classList.remove("hidden");
        return;
      }
      if (!global.QB_AI) {
        tr.className = "ai-test-result err";
        tr.textContent = "AI 模块未加载。";
        tr.classList.remove("hidden");
        return;
      }
      // 用临时配置（不落盘）测一次
      tr.className = "ai-test-result loading";
      tr.textContent = "正在测试连接…（最多等待 45 秒）";
      tr.classList.remove("hidden");
      const saved = global.QB_AI.getConfig();
      global.QB_AI.saveConfig({ baseUrl: baseUrl, apiKey: apiKey, model: model });
      global.QB_AI.testConnection().then((r) => {
        // 恢复原配置（避免测试把未保存的密钥写死）
        if (saved) global.QB_AI.saveConfig(saved); else global.QB_AI.clearConfig();
        if (r.ok) {
          tr.className = "ai-test-result ok";
          tr.textContent = "连接成功：" + r.text.slice(0, 60);
        } else {
          tr.className = "ai-test-result err";
          tr.textContent = "连接失败【" + r.code + "】" + r.message;
        }
      });
    },

    /** 渲染 AI 解读面板（报告区内）：未配置→引导；已配置且未生成→按钮；生成中→加载；完成→解读卡片 */
    renderAIPanel() {
      const panel = this.$("ai-panel");
      if (!panel) return;
      if (!this.state.lastResult) {
        panel.innerHTML = "";
        return;
      }
      if (!global.QB_AI || !global.QB_AI.hasConfig()) {
        panel.innerHTML =
          '<div class="ai-card ai-muted"><div class="ai-card-head"><b>AI 智能解读</b>'
          + '<span class="ai-badge">AI ENHANCE</span></div>'
          + '<p class="ai-empty">未配置 AI 接口密钥。配置后，可在规则引擎报告基础上生成 AI 解读'
          + '（优势/风险/建议/结论）。点击右上角「▲ AI 设置」填写密钥，仅保存在本机；点击生成时将弹出密钥设置。</p></div>';
        return;
      }
      if (this.state.aiInsightLoading) {
        panel.innerHTML =
          '<div class="ai-card"><div class="ai-card-head"><b>AI 智能解读</b>'
          + '<span class="ai-badge">AI ENHANCE</span></div>'
          + '<div class="ai-loading"><span class="ai-spinner"></span>正在生成 AI 解读…</div></div>';
        return;
      }
      if (this.state.aiInsight) {
        const ins = this.state.aiInsight;
        if (!ins.ok) {
          panel.innerHTML =
            '<div class="ai-card"><div class="ai-card-head"><b>AI 智能解读</b>'
            + '<span class="ai-badge">AI ENHANCE</span>'
            + '<span class="ai-desc">AI 生成失败，可点击重试（规则引擎报告不受影响）</span>'
            + '<button class="ai-btn-gen" id="ai-btn-gen">重新生成</button></div>'
            + '<div class="ai-error"><span class="ai-err-code">' + (ins.code || "error") + "</span>"
            + escText(ins.message || "AI 请求失败") + "</div></div>";
        } else {
          const sec = (t, items, cls) => items && items.length
            ? '<div class="ai-sec ' + cls + '"><h5>' + t + "</h5><ul>"
              + items.map((x) => "<li>" + escText(x) + "</li>").join("") + "</ul></div>"
            : "";
          panel.innerHTML =
            '<div class="ai-card"><div class="ai-card-head"><b>AI 智能解读</b>'
            + '<span class="ai-badge">AI ENHANCE</span>'
            + '<span class="ai-desc">基于规则引擎评分生成，仅供参考，不作为投资/经营决策的唯一依据</span>'
            + '<button class="ai-btn-gen" id="ai-btn-gen">重新生成</button></div>'
            + '<div class="ai-body">'
            + (ins.summary ? '<div class="ai-summary">' + escText(ins.summary) + "</div>" : "")
            + sec("✅ 优势", ins.strengths, "sec-strength")
            + sec("⚠️ 风险提示", ins.risks, "sec-risk")
            + sec("🛠 改进建议", ins.suggestions, "sec-sugg")
            + (ins.conclusion ? '<div class="ai-conclusion">' + escText(ins.conclusion) + "</div>" : "")
            + "</div>"
            + '<p class="ai-note">AI 解读由外部大模型生成，请以规则引擎评分为准；缺失指标越多，解读不确定性越高。</p></div>';
        }
        const btn = document.getElementById("ai-btn-gen");
        if (btn) btn.addEventListener("click", () => this.generateAIInsight(true));
        return;
      }
      // 已配置但尚未为本次结果生成
      panel.innerHTML =
        '<div class="ai-card"><div class="ai-card-head"><b>AI 智能解读</b>'
        + '<span class="ai-badge">AI ENHANCE</span>'
        + '<span class="ai-desc">点击生成基于本次评分结果的 AI 解读（优势/风险/建议/结论）</span>'
        + '<button class="ai-btn-gen" id="ai-btn-gen">生成 AI 解读</button></div></div>';
      const btn2 = document.getElementById("ai-btn-gen");
      if (btn2) btn2.addEventListener("click", () => this.generateAIInsight(false));
    },

    /** 调用 AI 生成解读（失败降级：面板显示错误 + 重试入口，不影响规则报告） */
    generateAIInsight(force) {
      if (!this.state.lastResult) return;
      if (!this.ensureAIKey()) return;
      if (this.state.aiInsightLoading) return;
      if (this.state.aiInsight && !force) return;
      this.state.aiInsightLoading = true;
      delete this.state.aiInsight;
      this.renderAIPanel();
      const result = this.state.lastResult;
      global.QB_AI.generateInsight(result, {
        companyName: this.state.companyName,
        scenarioName: result.scenarioName,
      }).then((ins) => {
        this.state.aiInsightLoading = false;
        this.state.aiInsight = ins;
        this.renderAIPanel();
        console.log("[企评小宝] AI 解读生成完成 ok=" + ins.ok);
      });
    },

    /** AI 密钥就绪校验：未配置则弹出 AI 设置引导窗（返回 false 表示已弹窗拦截） */
    ensureAIKey() {
      if (global.QB_AI && global.QB_AI.hasConfig()) return true;
      this.openAISettings();
      return false;
    },

    /* ========== 顶栏搜索栏（套壳复用 company-name + sample-select） ========== */

    /** 顶栏全局搜索：命中示例 → 载入公开数据；未命中 → 按企业名开始评估 */
    topSearch() {
      const input = this.$("top-search-input");
      const q = (input ? input.value : "").trim();
      if (!q) return;
      const sample = QB_SAMPLES.find((s) => s.name.includes(q))
        || QB_SAMPLES.find((s) => s.name.toLowerCase().includes(q.toLowerCase()));
      if (sample) {
        this.$("company-name").value = sample.name;
        this.state.companyName = sample.name;
        this.onStart(); // 先重置表单进入录入区
        this.$("sample-select").value = sample.id;
        this.onSampleChange(sample.id); // 再载入示例公开数据
        const hint = this.$("score-hint");
        if (hint) hint.textContent = "已从顶栏检索并载入示例企业「" + sample.name + "」";
      } else {
        this.$("company-name").value = q;
        this.onStart();
      }
    },

    /* ========== 设置面板（风格 / 历史 / AI 密钥） ========== */

    /** 打开设置面板：预填主题、AI 表单与历史列表 */
    openSettings() {
      const overlay = this.$("settings-overlay");
      if (!overlay) return;
      const cfg = global.QB_AI ? global.QB_AI.getConfig() : null;
      const def = (global.QB_AI && global.QB_AI.DEFAULT_BASE_URL) ? global.QB_AI.DEFAULT_BASE_URL : "https://api.deepseek.com/v1";
      const defModel = (global.QB_AI && global.QB_AI.DEFAULT_MODEL) ? global.QB_AI.DEFAULT_MODEL : "deepseek-chat";
      const themeEl = this.$("theme-select");
      let curTheme = document.body.dataset.theme || "light";
      try { curTheme = localStorage.getItem("qpb_theme") || curTheme; } catch (e) { /* 忽略 */ }
      if (themeEl) themeEl.value = curTheme;
      this.$("s-ai-base-url").value = cfg ? cfg.baseUrl : def;
      this.$("s-ai-api-key").value = cfg ? cfg.apiKey : "";
      this.$("s-ai-model").value = cfg ? cfg.model : defModel;
      const autoEl = this.$("s-ai-autosearch");
      if (autoEl) autoEl.checked = this._aiAutoSearchOn();
      const tr = this.$("s-ai-test-result");
      tr.classList.add("hidden");
      tr.textContent = "";
      this.renderSettingsHistory();
      overlay.classList.remove("hidden");
    },

    closeSettings() {
      const overlay = this.$("settings-overlay");
      if (overlay) overlay.classList.add("hidden");
    },

    /** 渲染设置面板中的历史列表（chartEl 传 null：只渲染列表） */
    renderSettingsHistory() {
      if (global.QB_HISTORY && global.QB_HISTORY.renderAll) {
        QB_HISTORY.renderAll("settings-history", null);
      } else {
        const el = this.$("settings-history");
        if (el) el.innerHTML = '<p class="empty-tip">历史记录模块未加载。</p>';
      }
    },

    /** 清空全部评估历史并刷新设置面板中的列表 */
    clearHistory() {
      if (global.QB_HISTORY) QB_HISTORY.clear();
      this.renderSettingsHistory();
      const hint = this.$("score-hint");
      if (hint) hint.textContent = "已清空全部评估历史记录。";
    },

    /** 主题下拉变更 → 应用并保存主题 */
    saveTheme() {
      const themeEl = this.$("theme-select");
      if (themeEl) this.applyTheme(themeEl.value);
    },

    /** 应用界面主题并持久化（light 默认 / dark / green / orange） */
    applyTheme(name) {
      const theme = (name === "dark" || name === "green" || name === "orange") ? name : "light";
      document.body.dataset.theme = theme;
      try { localStorage.setItem("qpb_theme", theme); } catch (e) { /* 忽略 */ }
    },

    /* ========== 设置面板 AI 密钥表单（#s- 前缀，与 #ai- 共用同一存储） ========== */

    /** 保存 AI 配置（设置面板入口） */
    saveAISettingsFromSettings() {
      const baseUrl = this.$("s-ai-base-url").value.trim();
      const apiKey = this.$("s-ai-api-key").value.trim();
      const model = this.$("s-ai-model").value.trim();
      const tr = this.$("s-ai-test-result");
      if (!apiKey) {
        tr.className = "ai-test-result err";
        tr.textContent = "API 密钥不能为空。";
        tr.classList.remove("hidden");
        return;
      }
      if (!global.QB_AI) {
        tr.className = "ai-test-result err";
        tr.textContent = "AI 模块未加载，请检查 js/ai.js 引用。";
        tr.classList.remove("hidden");
        return;
      }
      const ok = global.QB_AI.saveConfig({ baseUrl: baseUrl, apiKey: apiKey, model: model });
      if (ok) {
        this.closeSettings();
        const hint = this.$("score-hint");
        if (hint) hint.textContent = "AI 配置已保存（仅本机）· 评分后可在报告中一键生成 AI 解读";
        this.renderAIPanel();
        if (this.state.lastResult) this.renderAISearchPanel();
      } else {
        tr.className = "ai-test-result err";
        tr.textContent = "配置保存失败，请重试。";
        tr.classList.remove("hidden");
      }
    },

    /** 清除 AI 配置（设置面板入口） */
    clearAISettingsFromSettings() {
      if (global.QB_AI) global.QB_AI.clearConfig();
      this.$("s-ai-api-key").value = "";
      const tr = this.$("s-ai-test-result");
      tr.className = "ai-test-result";
      tr.textContent = "已清除本机保存的密钥与配置。";
      tr.classList.remove("hidden");
      this.renderAIPanel();
      if (this.state.lastResult) this.renderAISearchPanel();
    },

    /** 测试连接（设置面板入口） */
    testAIFromSettings() {
      this._runAITest(
        this.$("s-ai-base-url").value.trim(),
        this.$("s-ai-api-key").value.trim(),
        this.$("s-ai-model").value.trim(),
        "s-ai-test-result"
      );
    },

    /* ========== AI 参数检索面板（可选增强，非强制） ========== */

    /** 读取「自动检索」开关（qpb_ai_autosearch === "1"） */
    _aiAutoSearchOn() {
      try { return localStorage.getItem("qpb_ai_autosearch") === "1"; } catch (e) { return false; }
    },

    /** 渲染 AI 参数检索面板（未配置引导 / 加载 / 失败 / 成功 / 已配置未生成 五态） */
    renderAISearchPanel() {
      const panel = this.$("ai-search-panel");
      if (!panel) return;
      if (!this.state.lastResult) {
        panel.innerHTML = "";
        return;
      }
      const hasCfg = !!(global.QB_AI && global.QB_AI.hasConfig());
      if (!hasCfg) {
        // 未配置 → 引导卡（配置密钥 / 直接触发检索两种入口）
        panel.innerHTML =
          '<div class="ai-card ai-search-card ai-muted"><div class="ai-card-head"><b>AI 参数检索</b>'
          + '<span class="ai-badge">AI SEARCH</span></div>'
          + '<p class="ai-empty">可选：让 AI 检索并分析各项参数（需先配置 AI 密钥）。'
          + '配置后可为本次评分生成需要联网核实的参数要点与初步分析。</p>'
          + '<div class="ai-search-actions">'
          + '<button class="ai-btn-gen ai-search-gen-btn" id="ai-search-settings-btn">配置密钥</button>'
          + '<button class="ai-btn-gen ai-search-gen-btn" id="ai-search-gen-btn">AI 参数检索</button>'
          + "</div></div>";
        const sb = document.getElementById("ai-search-settings-btn");
        if (sb) sb.addEventListener("click", () => this.openAISettings());
        const gb = document.getElementById("ai-search-gen-btn");
        if (gb) gb.addEventListener("click", () => { if (this.ensureAIKey()) this.generateAISearch(false); });
        return;
      }
      if (this.state.aiSearchLoading) {
        // 加载中
        panel.innerHTML =
          '<div class="ai-card ai-search-card"><div class="ai-card-head"><b>AI 参数检索</b>'
          + '<span class="ai-badge">AI SEARCH</span></div>'
          + '<div class="ai-loading"><span class="ai-spinner"></span>AI 正在检索并分析各项参数…</div></div>';
        return;
      }
      if (this.state.aiSearch) {
        const res = this.state.aiSearch;
        if (!res.ok) {
          // 失败 → 错误卡 + 重新检索
          panel.innerHTML =
            '<div class="ai-card ai-search-card"><div class="ai-card-head"><b>AI 参数检索</b>'
            + '<span class="ai-badge">AI SEARCH</span>'
            + '<span class="ai-desc">检索失败，可点击重试（规则引擎报告不受影响）</span>'
            + '<button class="ai-btn-gen ai-search-gen-btn" id="ai-search-gen-btn">重新检索</button></div>'
            + '<div class="ai-error"><span class="ai-err-code">' + escText(res.code || "error") + "</span>"
            + escText(res.message || "AI 检索失败") + "</div></div>";
        } else {
          // 成功 → 结构化检索结果卡
          const dimsHtml = (res.dimensions || []).map((d) =>
            '<div class="ai-search-dim"><h5>' + escText(d.name || "维度") + "</h5>"
            + '<ul class="ai-search-points">'
            + (Array.isArray(d.points) ? d.points.map((p) => "<li>" + escText(p) + "</li>").join("") : "")
            + "</ul></div>").join("");
          const missingHtml = (res.missing && res.missing.length)
            ? '<div class="ai-search-missing"><h5>缺失指标检索建议</h5><ul>'
              + res.missing.map((m) => "<li>" + escText(m) + "</li>").join("") + "</ul></div>"
            : "";
          panel.innerHTML =
            '<div class="ai-card ai-search-card"><div class="ai-card-head"><b>AI 参数检索</b>'
            + '<span class="ai-badge">AI SEARCH</span>'
            + '<span class="ai-desc">需要联网检索核实的参数要点与初步分析（由外部大模型生成，仅供参考）</span>'
            + '<button class="ai-btn-gen ai-search-gen-btn" id="ai-search-gen-btn">重新检索</button></div>'
            + '<div class="ai-body">'
            + (res.summary ? '<div class="ai-search-summary">' + escText(res.summary) + "</div>" : "")
            + dimsHtml
            + missingHtml
            + "</div></div>";
        }
        const btn = document.getElementById("ai-search-gen-btn");
        if (btn) btn.addEventListener("click", () => this.generateAISearch(true));
        return;
      }
      // 已配置但尚未为本次结果生成
      const autoOn = this._aiAutoSearchOn();
      panel.innerHTML =
        '<div class="ai-card ai-search-card"><div class="ai-card-head"><b>AI 参数检索</b>'
        + '<span class="ai-badge">AI SEARCH</span>'
        + '<span class="ai-desc">' + (autoOn ? "自动检索已开启：评分后将自动生成" : "自动检索已关闭（可在设置中开启）") + "</span>"
        + '<button class="ai-btn-gen ai-search-gen-btn" id="ai-search-gen-btn">AI 参数检索（可选）</button></div></div>';
      const btn2 = document.getElementById("ai-search-gen-btn");
      if (btn2) btn2.addEventListener("click", () => this.generateAISearch(false));
    },

    /** 触发 AI 参数检索（失败降级为错误卡，不影响规则报告） */
    generateAISearch(force) {
      if (!this.state.lastResult) return;
      if (!this.ensureAIKey()) return;
      if (this.state.aiSearchLoading) return;
      if (this.state.aiSearch && !force) return;
      this.state.aiSearchLoading = true;
      delete this.state.aiSearch;
      this.renderAISearchPanel();
      const result = this.state.lastResult;
      global.QB_AI.searchParameters(result, {
        companyName: this.state.companyName,
        scenarioName: result.scenarioName,
      }).then((res) => {
        this.state.aiSearchLoading = false;
        this.state.aiSearch = res;
        this.renderAISearchPanel();
        console.log("[企评小宝] AI 参数检索完成 ok=" + res.ok);
      });
    },

    /** 第一步：开始评估（校验企业名 → 展示数据录入区 → 渲染表单） */
    onStart() {
      const name = this.$("company-name").value.trim();
      if (!name) {
        const fb = this.$("chat-feedback");
        fb.textContent = "请先输入企业名称，例如：北京某某科技有限公司";
        fb.classList.remove("hidden");
        return;
      }
      this.$("chat-feedback").classList.add("hidden");

      this.state.companyName = name;
      // 评估视角由视角卡 selectPerspective 维护（scenario-select 已移除），此处保持 state.scenarioKey 不变

      // 重置录入区
      this.state.values = QB_ENGINE.emptyValues();
      this.$("sample-select").value = "";
      this.$("sample-fields").innerHTML = "";
      this.$("manual-form").innerHTML = "";

      // 渲染公开数据表单（全量 49 项，默认空，可被示例填充）
      this.renderPublicForm(null);
      // 渲染用户补充表单（全量 49 项）
      this.renderManualForm();

      // 切到第二步
      // 重置 AI 解读 / 参数检索状态（新一轮评估）
      this.state.aiInsight = null;
      this.state.aiInsightLoading = false;
      this.state.aiSearch = null;
      this.state.aiSearchLoading = false;
      const asp = this.$("ai-search-panel");
      if (asp) asp.innerHTML = "";

      this.$("step-input").classList.add("hidden");
      this.$("step-data").classList.remove("hidden");
      this.$("step-result").classList.add("hidden");
      this.$("step-history").classList.add("hidden");
      this.updateStepper(2);

      this.$("score-hint").textContent = "已选择场景：" + this.scenarioName() + " · 待录入数据";
    },

    scenarioName() {
      const sc = QB_INDICATORS.scenarios[this.state.scenarioKey];
      return sc ? sc.name : "自定义权重";
    },

    /** 回到首页：切回第一步（选择视角 + 输入企业名），复位步骤条并滚到顶部 */
    goHome() {
      this.$("step-data").classList.add("hidden");
      this.$("step-result").classList.add("hidden");
      this.$("step-history").classList.add("hidden");
      const input = this.$("step-input");
      if (input) input.classList.remove("hidden");
      this.updateStepper(1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },

    /** 同步 Shell 步骤条激活态 */
    updateStepper(step) {
      document.querySelectorAll("#step-progress .step-item").forEach((item) => {
        item.classList.toggle("active", Number(item.dataset.step) === step);
      });
    },

    /** 收集已填指标值：公开表单值 + 用户补充表单值（用户补充优先覆盖） */
    collectValues() {
      const vals = QB_ENGINE.emptyValues();
      // 公开数据表单
      document.querySelectorAll("#tab-public input[data-ind]").forEach((input) => {
        if (input.value !== "") vals[input.dataset.ind] = Number(input.value);
      });
      // 用户补充表单（覆盖）
      document.querySelectorAll("#tab-manual input[data-ind]").forEach((input) => {
        if (input.value !== "") vals[input.dataset.ind] = Number(input.value);
      });
      return vals;
    },

    /** 渲染公开数据表单（可被示例企业填充；indicator 列表来自指标库） */
    renderPublicForm(sample) {
      const container = this.$("sample-fields");
      container.innerHTML = "";
      QB_INDICATORS.dimensions.forEach((dim) => {
        const groupTitle = document.createElement("div");
        groupTitle.className = "field-group-title";
        groupTitle.textContent = dim.name;
        container.appendChild(groupTitle);
        dim.children.forEach((l1) => {
          l1.children.forEach((ind) => {
            const val = sample && sample.values[ind.id] !== undefined && sample.values[ind.id] !== null
              ? sample.values[ind.id] : "";
            container.appendChild(this.buildField(ind, val, sample ? "public" : "none"));
          });
        });
      });
    },

    /** 渲染用户补充表单（空表单，覆盖公开数据） */
    renderManualForm() {
      const container = this.$("manual-form");
      container.innerHTML = "";
      QB_INDICATORS.dimensions.forEach((dim) => {
        const groupTitle = document.createElement("div");
        groupTitle.className = "field-group-title";
        groupTitle.textContent = dim.name;
        container.appendChild(groupTitle);
        dim.children.forEach((l1) => {
          l1.children.forEach((ind) => {
            container.appendChild(this.buildField(ind, "", "user"));
          });
        });
      });
    },

    /** 构造单个指标输入卡片（来源标注语文化为证据类型） */
    buildField(ind, value, src) {
      const wrap = document.createElement("div");
      wrap.className = "field-item";

      const label = document.createElement("label");
      label.textContent = ind.name;

      const desc = document.createElement("span");
      desc.className = "field-desc";
      desc.textContent = ind.desc + (ind.direction === "negative" ? "（负向指标：值越低越好）" : "");

      const input = document.createElement("input");
      input.type = "number";
      input.step = "any";
      input.dataset.ind = ind.id;
      input.placeholder = "参考范围 " + ind.reference.min + " ~ " + ind.reference.max + (ind.unit ? " " + ind.unit : "");
      if (value !== "") {
        input.value = value;
        input.disabled = false;
        input.title = "公开数据可编辑";
      }

      const unit = document.createElement("span");
      unit.className = "unit";
      unit.textContent = ind.unit || "";

      // 证据来源标签（设计方案 4.3：Documented 公开 / Discovered 用户补充 / Missing 待填写）
      const srcTag = document.createElement("span");
      if (src === "public") {
        srcTag.className = "src src-public";
        srcTag.textContent = "公开数据 · Documented · 可编辑";
      } else if (src === "user") {
        srcTag.className = "src src-user";
        srcTag.textContent = "用户补充 · Discovered";
      } else {
        srcTag.className = "src src-none";
        srcTag.textContent = "待填写 · Missing";
      }

      wrap.appendChild(label);
      wrap.appendChild(desc);
      wrap.appendChild(input);
      wrap.appendChild(unit);
      wrap.appendChild(srcTag);
      return wrap;
    },

    /** 选择示例企业：填充公开数据表单 */
    onSampleChange(sampleId) {
      const sample = QB_SAMPLES.find((s) => s.id === sampleId) || null;
      this.renderPublicForm(sample);
      if (sample) {
        this.$("score-hint").textContent = "已载入「" + sample.name + "」公开数据，可编辑后评分；也可切换至「用户补充填报」补全信息";
      } else {
        this.$("score-hint").textContent = "已选择场景：" + this.scenarioName() + " · 待录入数据";
      }
    },

    /** 第三步：触发评分 */
    onScore() {
      const values = this.collectValues();
      let scenarioArg = this.state.scenarioKey;
      if (this.state.customWeights) {
        scenarioArg = { name: "自定义权重", weights: this.state.customWeights };
      }

      const result = QB_ENGINE.score(values, scenarioArg);
      result.companyName = this.state.companyName;
      this.state.values = values;
      this.state.lastResult = result;

      // 渲染结果
      this.renderResult(result);

      // 保存历史
      if (global.QB_HISTORY) {
        QB_HISTORY.save(result, values);
      }

      // 切换第三步
      this.$("step-data").classList.add("hidden");
      this.$("step-result").classList.remove("hidden");
      this.$("step-history").classList.add("hidden");
      this.updateStepper(3);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },

    /** 渲染评分结果（总分、等级、雷达图、报告、AI 面板） */
    renderResult(result) {
      // 总分
      this.$("total-score").textContent = result.total === null ? "--" : result.total.toFixed(2);
      const gradeEl = this.$("score-grade");
      const metaEl = this.$("score-meta");
      if (result.total === null) {
        gradeEl.textContent = "数据不足";
        gradeEl.className = "grade x";
      } else {
        const g = this.grade(result.total);
        gradeEl.textContent = g.label;
        gradeEl.className = "grade " + g.cls;
      }
      // 元信息：接入证据链覆盖率与置信度（设计方案 4.3）
      let evMeta = "缺失 " + result.missingCount + "/" + result.totalCount + " 项";
      if (global.QB_EVIDENCE) {
        const stat = QB_EVIDENCE.summarize(result);
        evMeta = "数据覆盖率 " + stat.coverage + "%（" + stat.confidence + "置信） · 缺失 " + result.missingCount + "/" + result.totalCount + " 项";
      }
      metaEl.textContent = result.companyName + " · " + result.scenarioName + " · " + evMeta;

      // 雷达图
      if (global.QB_RADAR && global.QB_RADAR.renderRadar) {
        QB_RADAR.renderRadar(result.dims || result.dimensions || [], "radar-chart", result);
      } else {
        this.$("radar-chart").textContent = "[雷达图模块未加载]";
      }

      // 可解释报告
      if (global.QB_REPORT && global.QB_REPORT.render) {
        global.QB_REPORT.render(result, "report-box");
      } else {
        this.$("report-box").textContent = "[报告模块未加载]";
      }

      // AI 智能解读面板（研究设计方案：AI 增强而非替代，未配置自动降级）
      this.state.aiInsight = null;
      this.state.aiInsightLoading = false;
      this.renderAIPanel();

      // AI 参数检索面板（可选：让 AI 生成需要联网核实的参数要点与初步分析）
      // 自动检索仅在开关打开且已配置密钥时触发；失败降级为错误卡，不影响规则报告
      this.state.aiSearch = null;
      this.state.aiSearchLoading = false;
      if (global.QB_AI && global.QB_AI.hasConfig() && this._aiAutoSearchOn()) {
        this.generateAISearch(false);
      } else {
        this.renderAISearchPanel();
      }
    },

    /** 等级划分：>=85 优秀 / >=70 良好 / >=55 中等 / >=40 关注 / <40 高风险 */
    grade(total) {
      if (total >= 85) return { label: "优秀 · 值得重点关注", cls: "a" };
      if (total >= 70) return { label: "良好 · 整体较优", cls: "b" };
      if (total >= 55) return { label: "中等 · 有亮点有短板", cls: "c" };
      if (total >= 40) return { label: "关注 · 风险需警惕", cls: "d" };
      return { label: "高风险 · 谨慎对待", cls: "x" };
    },

    /** 历史对比开关 */
    toggleHistory() {
      const sec = this.$("step-history");
      if (sec.classList.contains("hidden")) {
        if (global.QB_HISTORY && global.QB_HISTORY.renderAll) {
          QB_HISTORY.renderAll("history-list", "compare-chart");
        }
        sec.classList.remove("hidden");
      } else {
        sec.classList.add("hidden");
      }
    },
  };

  // 暴露到全局，DOM 就绪后初始化
  global.QB_APP = QB_APP;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => QB_APP.init());
  } else {
    QB_APP.init();
  }
})(window);