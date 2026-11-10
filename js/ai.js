/**
 * 企评小宝 · AI 智能解读客户端（ai.js）
 *
 * 依据《企业评估交互端全栈方案设计》原则三「AI 增强而非替代」落地：
 *   在规则引擎报告基础上，接入外部大模型 API，为评估结果提供 AI 解读
 *   （优势 / 风险 / 改进建议 / 总结），AI 结果仅作增强，不替代规则评分。
 *
 * 设计约束：
 *   - API 密钥由用户在应用内自行填写，保存于本机 localStorage（不做硬编码）
 *   - 兼容 OpenAI Chat Completions 接口（OpenAI / DeepSeek / 通义 等 OpenAI 兼容端点）
 *   - 无密钥 / 离线 / 接口异常时返回明确错误分类，由调用方优雅降级，绝不抛出未捕获异常
 *   - 支持 baseUrl / apiKey / model 配置与「测试连接」
 *
 * 接口：
 *   QB_AI.getConfig() / saveConfig() / clearConfig() / hasConfig()
 *   QB_AI.testConnection()                       —— 最小请求验证可用性
 *   QB_AI.ask(role, content)                     —— 通用对话（返回文本）
 *   QB_AI.generateInsight(result, opts)          —— 基于评分结果生成结构化 AI 解读
 *   QB_AI.searchParameters(result, opts)         —— 生成需要联网检索核实的参数要点与初步分析
 *
 * 错误分类（AIError.code）：not_configured / network / cors / timeout / api_error / parse_error
 */

(function (global) {
  "use strict";

  var STORAGE_KEY = "qpb_ai_config";
  var DEFAULT_MODEL = "deepseek-chat";
  var DEFAULT_BASE_URL = "https://api.deepseek.com/v1";
  var REQUEST_TIMEOUT_MS = 45000;

  /** AIError：带分类码的错误对象 */
  function AIError(code, message) {
    var err = new Error(message);
    err.name = "AIError";
    err.code = code;
    return err;
  }

  /** 浏览器 localStorage 读取（Node 校验环境降级为内存） */
  function storage() {
    var mem = null;
    return {
      get: function () {
        try {
          if (global.localStorage) return global.localStorage.getItem(STORAGE_KEY);
        } catch (e) { /* 不可用则走内存 */ }
        return mem;
      },
      set: function (v) {
        try {
          if (global.localStorage) { global.localStorage.setItem(STORAGE_KEY, v); return; }
        } catch (e) { /* 忽略 */ }
        mem = v;
      },
      remove: function () {
        try {
          if (global.localStorage) { global.localStorage.removeItem(STORAGE_KEY); return; }
        } catch (e) { /* 忽略 */ }
        mem = null;
      },
    };
  }

  var QB_AI = {
    _store: storage(),
    DEFAULT_MODEL: DEFAULT_MODEL,
    DEFAULT_BASE_URL: DEFAULT_BASE_URL,

    /** 读取配置 {baseUrl, apiKey, model}，未配置返回 null */
    getConfig: function () {
      var raw = this._store.get();
      if (!raw) return null;
      try {
        var cfg = JSON.parse(raw);
        if (!cfg || !cfg.apiKey) return null;
        return {
          baseUrl: cfg.baseUrl && cfg.baseUrl.trim() ? cfg.baseUrl.trim().replace(/\/+$/, "") : DEFAULT_BASE_URL,
          apiKey: cfg.apiKey.trim(),
          model: cfg.model && cfg.model.trim() ? cfg.model.trim() : DEFAULT_MODEL,
        };
      } catch (e) {
        return null;
      }
    },

    /** 保存配置（密钥存本机，仅本应用读取） */
    saveConfig: function (cfg) {
      var payload = {
        baseUrl: cfg.baseUrl || DEFAULT_BASE_URL,
        apiKey: cfg.apiKey || "",
        model: cfg.model || DEFAULT_MODEL,
      };
      if (!payload.apiKey) return false;
      this._store.set(JSON.stringify(payload));
      return true;
    },

    /** 清除本机保存的密钥与配置 */
    clearConfig: function () {
      this._store.remove();
    },

    hasConfig: function () {
      return !!this.getConfig();
    },

    /**
     * 通用对话请求（OpenAI Chat Completions 非流式）
     * @param {Array} messages [{role:'system'|'user'|'assistant', content}]
     * @param {Object} opts {maxTokens, temperature}
     * @returns {Promise<string>} 模型回复文本
     * @throws AIError
     */
    chat: function (messages, opts) {
      var cfg = this.getConfig();
      if (!cfg) {
        return Promise.reject(AIError("not_configured", "未配置 AI 接口密钥，请在「AI 设置」中填写后再试"));
      }
      opts = opts || {};

      var controller = (typeof AbortController !== "undefined") ? new AbortController() : null;
      var timer = controller
        ? setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS)
        : null;

      var url = cfg.baseUrl + "/chat/completions";
      var body = {
        model: cfg.model,
        messages: messages,
        max_tokens: opts.maxTokens || 1800,
        temperature: opts.temperature === undefined ? 0.6 : opts.temperature,
        stream: false,
      };

      var fetchImpl = (typeof global.fetch === "function")
        ? global.fetch
        : (typeof fetch === "function" ? fetch : null);

      return Promise.resolve()
        .then(function () {
          if (!fetchImpl) throw AIError("network", "当前环境不支持网络请求（fetch 不可用）");
          return fetchImpl(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer " + cfg.apiKey,
            },
            body: JSON.stringify(body),
            signal: controller ? controller.signal : undefined,
          });
        })
        .then(function (resp) {
          if (!resp.ok) {
            return resp.text().catch(function () { return ""; }).then(function (txt) {
              var detail = "";
              try {
                var j = JSON.parse(txt);
                detail = (j && j.error && j.error.message) ? ("：" + j.error.message) : "";
              } catch (e) { if (txt) detail = "：" + String(txt).slice(0, 160); }
              var code = resp.status === 401 || resp.status === 403 ? "auth_error" : "api_error";
              throw AIError(code, "模型接口返回 " + resp.status + detail);
            });
          }
          return resp.json();
        })
        .then(function (data) {
          var choice = data && data.choices && data.choices[0];
          var content = choice && choice.message && choice.message.content;
          if (typeof content !== "string" || !content.trim()) {
            throw AIError("parse_error", "模型返回内容为空或格式不支持");
          }
          return content.trim();
        })
        .catch(function (err) {
          // 超时 / 中断
          if (err && (err.name === "AbortError" || err.code === 20)) {
            throw AIError("timeout", "AI 请求超时（" + (REQUEST_TIMEOUT_MS / 1000) + " 秒），请检查网络或重试");
          }
          // CORS / 网络失败（TypeError: Failed to fetch）
          if (err instanceof TypeError) {
            throw AIError("network", "网络请求失败，请检查网络连接、接口地址是否可访问及是否支持跨域（CORS）");
          }
          if (err && err.name === "AIError") throw err;
          throw AIError("network", String(err && err.message || err));
        })
        .finally(function () {
          if (timer) clearTimeout(timer);
        });
    },

    /** 测试连接：最小请求验证密钥与接口可用 */
    testConnection: function () {
      return this.chat(
        [{ role: "user", content: "请回复：连接成功" }],
        { maxTokens: 20, temperature: 0 }
      ).then(function (text) {
        return { ok: true, text: text };
      }).catch(function (err) {
        return { ok: false, code: err.code, message: err.message };
      });
    },

    /**
     * 基于评分结果生成结构化 AI 解读（AI 增强，非替代）
     * @param {Object} result QB_ENGINE.score() 结果
     * @param {Object} opts {companyName, scenarioName}
     * @returns {Promise<Object>} {ok, summary, strengths[], risks[], suggestions[], conclusion}
     *   失败时 {ok:false, code, message}（不抛出，便于调用方降级）
     */
    generateInsight: function (result, opts) {
      var self = this;
      opts = opts || {};
      if (!result || !result.dims) {
        return Promise.resolve({ ok: false, code: "parse_error", message: "评分结果为空，无法生成解读" });
      }

      var systemPrompt =
        "你是一名企业评估分析专家，服务于一家企业内部评估工作台。"
        + "系统采用 7 大维度（行业、财务、治理、技术、资本、风险、生态）规则引擎评估企业，"
        + "AI 的职责是基于这些客观评分给出有洞察的解读与建议，帮助决策者抓住重点。"
        + "要求：语言简洁专业，直接给结论；不得虚构评分数据之外的指标事实；"
        + "不要复述评分表本身，要给出「这意味着什么、下一步该做什么」。";

      var dimRows = (result.dims || []).map(function (d) {
        return "- " + d.name + "：得分 " + (d.score === null ? "缺失" : d.score.toFixed(1))
          + "（权重 " + (d.weight || 0).toFixed(2) + "）";
      }).join("\n");

      var userPrompt =
        "请对以下企业评估结果做解读（企业：" + (opts.companyName || "未命名企业")
        + "；视角：" + (opts.scenarioName || result.scenarioName || "投资参考")
        + "；综合评分：" + (result.total === null ? "数据不足" : result.total.toFixed(2)) + "；"
        + "缺失指标 " + (result.missingCount || 0) + "/" + (result.totalCount || 0) + "）：\n"
        + dimRows + "\n\n"
        + "请按以下结构输出（用 JSON，不要额外解释）：\n"
        + '{"summary":"2-3句总体判断","strengths":["优势1（对应维度）","优势2"],'
        + '"risks":["风险1（对应维度）","风险2"],"suggestions":["可执行建议1","建议2"],'
        + '"conclusion":"1句话最终结论"}';

      return this.chat(
        [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        { maxTokens: 1200, temperature: 0.5 }
      ).then(function (text) {
        var parsed = self._parseJson(text);
        if (!parsed) {
          return { ok: false, code: "parse_error", message: "模型返回无法解析为结构化解读，请重试", raw: text.slice(0, 200) };
        }
        return {
          ok: true,
          summary: parsed.summary || "",
          strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
          risks: Array.isArray(parsed.risks) ? parsed.risks : [],
          suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
          conclusion: parsed.conclusion || "",
          raw: text,
        };
      }).catch(function (err) {
        return { ok: false, code: err.code || "api_error", message: err.message };
      });
    },

    /**
     * 基于评分结果生成「需要联网检索核实的参数要点与初步分析」
     * @param {Object} result QB_ENGINE.score() 结果
     * @param {Object} opts {companyName, scenarioName}
     * @returns {Promise<Object>} {ok:true, summary, dimensions[{name, points[]}], missing[]}
     *   失败时 {ok:false, code, message}（不抛出，便于调用方降级）
     */
    searchParameters: function (result, opts) {
      var self = this;
      opts = opts || {};
      if (!result || !result.dims) {
        return Promise.resolve({ ok: false, code: "parse_error", message: "评分结果为空，无法生成参数检索要点" });
      }

      var systemPrompt =
        "你是企业尽调研究员，职责是基于给定的评分指标清单生成「需要联网检索核实的参数要点与初步分析」。"
        + "要求：只列真实可查的项目，不虚构具体数值；按维度给出需要核实的关键参数与初步分析要点；"
        + "对缺失指标给出检索建议；语言简洁专业。";

      var dimRows = (result.dims || []).map(function (d) {
        return "- " + d.name + "：得分 " + (d.score === null ? "缺失" : d.score.toFixed(1))
          + "（权重 " + (d.weight || 0).toFixed(2) + "）";
      }).join("\n");

      var userPrompt =
        "请基于以下企业评估结果生成需要联网检索核实的参数要点与初步分析"
        + "（企业：" + (opts.companyName || "未命名企业")
        + "；视角：" + (opts.scenarioName || result.scenarioName || "投资参考")
        + "；综合评分：" + (result.total === null ? "数据不足" : result.total.toFixed(2))
        + "；缺失指标 " + (result.missingCount || 0) + "/" + (result.totalCount || 0) + "）：\n"
        + dimRows + "\n"
        + "请按以下 JSON 输出（不要额外解释）：\n"
        + '{"summary":"1-2句总体判断","dimensions":[{"name":"维度名","points":["该维度需要检索核实的参数/初步分析要点"]}],"missing":["缺失指标对应的检索建议"]}';

      return this.chat(
        [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        { maxTokens: 1200, temperature: 0.4 }
      ).then(function (text) {
        var parsed = self._parseJson(text);
        if (!parsed) {
          return { ok: false, code: "parse_error", message: "模型返回无法解析为结构化检索要点，请重试", raw: text.slice(0, 200) };
        }
        return {
          ok: true,
          summary: parsed.summary || "",
          dimensions: Array.isArray(parsed.dimensions) ? parsed.dimensions : [],
          missing: Array.isArray(parsed.missing) ? parsed.missing : [],
          raw: text,
        };
      }).catch(function (err) {
        return { ok: false, code: err.code || "api_error", message: err.message };
      });
    },

    /** 从模型回复中提取 JSON（容忍代码块包裹与前后杂文本） */
    _parseJson: function (text) {
      if (!text) return null;
      var s = String(text).trim();
      // 去除 ```json ... ``` 代码块
      var fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fence) s = fence[1].trim();
      var start = s.indexOf("{");
      var end = s.lastIndexOf("}");
      if (start >= 0 && end > start) {
        s = s.slice(start, end + 1);
      }
      try {
        return JSON.parse(s);
      } catch (e) {
        return null;
      }
    },
  };

  global.QB_AI = QB_AI;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = QB_AI;
  }
})(typeof window !== "undefined" ? window : globalThis);