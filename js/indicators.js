/**
 * 企评小宝 · 指标体系配置（indicators.js）
 *
 * 结构说明（复刻自中金资本智能投决·多维数智企评平台，V3.4 PDF）：
 *   - 7 大维度（dimension，level=0）
 *   - 22 个一级指标（level=1）
 *   - 49 个二级指标（level=2）
 * 标注：
 *   [PDF公开] 指标结构直接来自《中科闻歌金融产品及案例介绍 V3.4》"中金资本智能投决"章节
 *   [推演补齐] PDF 未完整呈现的维度/指标，依据方案附录推演补齐
 *
 * 评分方法（PDF 原文公式）：
 *   正向指标  x_norm = (x - x_min) / (x_max - x_min)
 *   负向指标  x_norm = 1 - (x - x_min) / (x_max - x_min)
 *   得分范围 [0,1] 扩大 100 倍，保留两位小数；一级指标按二级指标加权求和。
 *
 * 场景权重（4 套 + 自定义）：investment / diligence / job / cooperation
 */

const QB_INDICATORS = {
  meta: {
    name: "企评小宝指标体系",
    source: "复刻自中金资本智能投决·多维数智企评平台（中科闻歌金融产品 V3.4）",
    spec: "7 大维度 / 22 个一级指标 / 49 个二级指标",
    updated: "2026-09-24",
  },
  dimensions: [
    {
      id: "d1",
      name: "行业情况",
      desc: "企业所处行业的市场空间、增长潜力、投融资活跃度与政策一致性",
      source: "[PDF公开]",
      level: 0,
      children: [
        {
          id: "d1-c1",
          name: "市场空间",
          desc: "行业总规模与扩展空间",
          source: "[PDF公开]",
          level: 1,
          children: [
            { id: "d1-c1-i1", name: "行业市场规模", desc: "目标行业当前市场规模（亿元量级），越大得分越高", direction: "positive", unit: "亿元", reference: { min: 0, max: 10000 }, weight: 0.34, level: 2 },
            { id: "d1-c1-i2", name: "市场渗透率", desc: "产品/服务在目标市场的渗透程度，越高说明空间越被确认", direction: "positive", unit: "%", reference: { min: 0, max: 100 }, weight: 0.33, level: 2 },
            { id: "d1-c1-i3", name: "市场增长率", desc: "目标市场近 3 年复合增长率（%）", direction: "positive", unit: "%", reference: { min: -10, max: 60 }, weight: 0.33, level: 2 },
          ],
        },
        {
          id: "d1-c2",
          name: "增长潜力",
          desc: "行业成长性与需求确定性",
          source: "[推演补齐]",
          level: 1,
          children: [
            { id: "d1-c2-i1", name: "行业增速", desc: "行业近 3 年复合增长率（%），越高成长性越好", direction: "positive", unit: "%", reference: { min: -10, max: 60 }, weight: 0.4, level: 2 },
            { id: "d1-c2-i2", name: "需求确定性", desc: "下游需求是否刚性、可预见（专家评分 0-100）", direction: "positive", unit: "分", reference: { min: 0, max: 100 }, weight: 0.3, level: 2 },
            { id: "d1-c2-i3", name: "潜在客群规模", desc: "目标客群数量与可触达规模（专家评分）", direction: "positive", unit: "分", reference: { min: 0, max: 100 }, weight: 0.3, level: 2 },
          ],
        },
        {
          id: "d1-c3",
          name: "投融资情况",
          desc: "行业资本关注度与融资活跃度",
          source: "[PDF公开]",
          level: 1,
          children: [
            { id: "d1-c3-i1", name: "行业融资活跃度", desc: "近一年行业融资事件活跃程度（相对指数，专家评分）", direction: "positive", unit: "分", reference: { min: 0, max: 100 }, weight: 0.6, level: 2 },
            { id: "d1-c3-i2", name: "头部资本关注度", desc: "头部投资机构在行业内的出手频率（专家评分）", direction: "positive", unit: "分", reference: { min: 0, max: 100 }, weight: 0.4, level: 2 },
          ],
        },
        {
          id: "d1-c4",
          name: "政策一致性",
          desc: "行业与宏观政策导向的匹配程度",
          source: "[PDF公开]",
          level: 1,
          children: [
            { id: "d1-c4-i1", name: "政策支持度", desc: "国家/地方对行业的支持政策强度（专家评分）", direction: "positive", unit: "分", reference: { min: 0, max: 100 }, weight: 0.5, level: 2 },
            { id: "d1-c4-i2", name: "监管友好度", desc: "行业监管环境是否友好稳定（专家评分）", direction: "positive", unit: "分", reference: { min: 0, max: 100 }, weight: 0.5, level: 2 },
          ],
        },
      ],
    },
    {
      id: "d2",
      name: "财务情况",
      desc: "企业成长潜力、经营能力与财务健康度",
      source: "[PDF公开]",
      level: 0,
      children: [
        {
          id: "d2-c1",
          name: "成长潜力",
          desc: "收入与盈利的增长动能",
          source: "[PDF公开]",
          level: 1,
          children: [
            { id: "d2-c1-i1", name: "营收增长率", desc: "近 3 年营收复合增速（%）", direction: "positive", unit: "%", reference: { min: -20, max: 100 }, weight: 0.4, level: 2 },
            { id: "d2-c1-i2", name: "利润增长率", desc: "近 3 年净利润复合增速（%）", direction: "positive", unit: "%", reference: { min: -30, max: 150 }, weight: 0.3, level: 2 },
            { id: "d2-c1-i3", name: "营收规模", desc: "当前年营收规模（亿元）", direction: "positive", unit: "亿元", reference: { min: 0, max: 100 }, weight: 0.3, level: 2 },
          ],
        },
        {
          id: "d2-c2",
          name: "经营能力",
          desc: "盈利质量与运营效率",
          source: "[PDF公开]",
          level: 1,
          children: [
            { id: "d2-c2-i1", name: "毛利率", desc: "主营业务毛利率（%）", direction: "positive", unit: "%", reference: { min: 0, max: 80 }, weight: 0.3, level: 2 },
            { id: "d2-c2-i2", name: "现金流健康度", desc: "经营性现金流为正且覆盖良好（专家评分）", direction: "positive", unit: "分", reference: { min: 0, max: 100 }, weight: 0.25, level: 2 },
            { id: "d2-c2-i3", name: "负债水平", desc: "资产负债率（%），越低越稳健（负向）", direction: "negative", unit: "%", reference: { min: 0, max: 95 }, weight: 0.25, level: 2 },
            { id: "d2-c2-i4", name: "资产周转率", desc: "总资产周转率（次/年），越高运营效率越好", direction: "positive", unit: "次/年", reference: { min: 0, max: 5 }, weight: 0.2, level: 2 },
          ],
        },
      ],
    },
    {
      id: "d3",
      name: "治理水平",
      desc: "核心团队、品牌价值与社会贡献",
      source: "[PDF公开]",
      level: 0,
      children: [
        {
          id: "d3-c1",
          name: "核心团队力",
          desc: "创始人/高管团队的稳定性与资历",
          source: "[PDF公开]",
          level: 1,
          children: [
            { id: "d3-c1-i1", name: "团队资历", desc: "核心团队行业经验与成功履历（专家评分）", direction: "positive", unit: "分", reference: { min: 0, max: 100 }, weight: 0.4, level: 2 },
            { id: "d3-c1-i2", name: "团队稳定性", desc: "近两年核心成员流失情况（专家评分，高=稳定）", direction: "positive", unit: "分", reference: { min: 0, max: 100 }, weight: 0.3, level: 2 },
            { id: "d3-c1-i3", name: "高管背景", desc: "高管教育/名企背景与行业背书（专家评分）", direction: "positive", unit: "分", reference: { min: 0, max: 100 }, weight: 0.3, level: 2 },
          ],
        },
        {
          id: "d3-c2",
          name: "品牌价值",
          desc: "品牌影响与市场口碑",
          source: "[PDF公开]",
          level: 1,
          children: [
            { id: "d3-c2-i1", name: "品牌知名度", desc: "目标客群中的品牌知晓度（专家评分）", direction: "positive", unit: "分", reference: { min: 0, max: 100 }, weight: 0.5, level: 2 },
            { id: "d3-c2-i2", name: "市场口碑", desc: "用户/客户评价与复购口碑（专家评分）", direction: "positive", unit: "分", reference: { min: 0, max: 100 }, weight: 0.5, level: 2 },
          ],
        },
        {
          id: "d3-c3",
          name: "社会贡献度",
          desc: "就业、纳税与社会责任",
          source: "[PDF公开]",
          level: 1,
          children: [
            { id: "d3-c3-i1", name: "就业贡献", desc: "员工规模与就业带动（相对指数）", direction: "positive", unit: "分", reference: { min: 0, max: 100 }, weight: 0.5, level: 2 },
            { id: "d3-c3-i2", name: "纳税合规", desc: "纳税及时性与合规记录（专家评分）", direction: "positive", unit: "分", reference: { min: 0, max: 100 }, weight: 0.5, level: 2 },
          ],
        },
      ],
    },
    {
      id: "d4",
      name: "技术能力",
      desc: "持续创新能力与研发实力",
      source: "[PDF公开]",
      level: 0,
      children: [
        {
          id: "d4-c1",
          name: "持续创新能力",
          desc: "创新投入与成果产出",
          source: "[PDF公开]",
          level: 1,
          children: [
            { id: "d4-c1-i1", name: "研发投入占比", desc: "研发费用占营收比例（%）", direction: "positive", unit: "%", reference: { min: 0, max: 40 }, weight: 0.4, level: 2 },
            { id: "d4-c1-i2", name: "专利与知识产权", desc: "有效专利/软著数量（件）", direction: "positive", unit: "件", reference: { min: 0, max: 500 }, weight: 0.3, level: 2 },
            { id: "d4-c1-i3", name: "研发投入持续性", desc: "连续研发投入年限与稳定性（年）", direction: "positive", unit: "年", reference: { min: 0, max: 20 }, weight: 0.3, level: 2 },
          ],
        },
        {
          id: "d4-c2",
          name: "研发能力",
          desc: "研发团队规模与成果转化",
          source: "[推演补齐]",
          level: 1,
          children: [
            { id: "d4-c2-i1", name: "研发团队占比", desc: "研发人员占员工总数比例（%）", direction: "positive", unit: "%", reference: { min: 0, max: 70 }, weight: 0.5, level: 2 },
            { id: "d4-c2-i2", name: "成果转化率", desc: "研发成果商业化落地情况（专家评分）", direction: "positive", unit: "分", reference: { min: 0, max: 100 }, weight: 0.5, level: 2 },
          ],
        },
      ],
    },
    {
      id: "d5",
      name: "资本认可情况",
      desc: "融资进展与资本方认可",
      source: "[PDF公开]",
      level: 0,
      children: [
        {
          id: "d5-c1",
          name: "融资情况",
          desc: "融资轮次、规模与投资方质量",
          source: "[PDF公开]",
          level: 1,
          children: [
            { id: "d5-c1-i1", name: "融资轮次", desc: "最新融资轮次（天使=20，A=40，B=60，C=80，D+=90，上市公司=100 查表得分）", direction: "positive", unit: "分", reference: { min: 0, max: 100 }, weight: 0.4, level: 2 },
            { id: "d5-c1-i2", name: "累计融资规模", desc: "累计融资金额（亿元）", direction: "positive", unit: "亿元", reference: { min: 0, max: 30 }, weight: 0.3, level: 2 },
            { id: "d5-c1-i3", name: "投资方质量", desc: "投资机构知名度与背书（专家评分）", direction: "positive", unit: "分", reference: { min: 0, max: 100 }, weight: 0.3, level: 2 },
          ],
        },
      ],
    },
    {
      id: "d6",
      name: "风险水平",
      desc: "司法、舆情、经营、监管、工商、宏观、外迁等风险（负向维度）",
      source: "[PDF公开]",
      level: 0,
      children: [
        {
          id: "d6-c1",
          name: "舆情风险",
          desc: "公司负面舆情情况",
          source: "[PDF公开]",
          level: 1,
          children: [
            { id: "d6-c1-i1", name: "负面舆情指数", desc: "近一年负面舆情事件严重程度（专家评分）", direction: "negative", unit: "分", reference: { min: 0, max: 100 }, weight: 0.6, level: 2 },
            { id: "d6-c1-i2", name: "舆情传播度", desc: "负面舆情扩散范围与持续时间（专家评分）", direction: "negative", unit: "分", reference: { min: 0, max: 100 }, weight: 0.4, level: 2 },
          ],
        },
        {
          id: "d6-c2",
          name: "司法风险",
          desc: "诉讼与被执行情况",
          source: "[PDF公开]",
          level: 1,
          children: [
            { id: "d6-c2-i1", name: "涉诉数量", desc: "近三年涉诉案件数量（件）", direction: "negative", unit: "件", reference: { min: 0, max: 50 }, weight: 0.5, level: 2 },
            { id: "d6-c2-i2", name: "被执行/失信记录", desc: "被执行人与失信记录情况（0=无，100=严重）", direction: "negative", unit: "分", reference: { min: 0, max: 100 }, weight: 0.5, level: 2 },
          ],
        },
        {
          id: "d6-c3",
          name: "经营风险",
          desc: "经营层面的潜在风险",
          source: "[PDF公开]",
          level: 1,
          children: [
            { id: "d6-c3-i1", name: "经营异常记录", desc: "工商经营异常名录记录次数", direction: "negative", unit: "次", reference: { min: 0, max: 10 }, weight: 0.5, level: 2 },
            { id: "d6-c3-i2", name: "客户集中度", desc: "前五大客户收入占比（%）", direction: "negative", unit: "%", reference: { min: 0, max: 100 }, weight: 0.5, level: 2 },
          ],
        },
        {
          id: "d6-c4",
          name: "监管风险",
          desc: "监管处罚与合规问题",
          source: "[PDF公开]",
          level: 1,
          children: [
            { id: "d6-c4-i1", name: "行政处罚次数", desc: "近三年行政处罚次数", direction: "negative", unit: "次", reference: { min: 0, max: 10 }, weight: 0.6, level: 2 },
            { id: "d6-c4-i2", name: "监管关注度", desc: "是否被监管重点关注（专家评分）", direction: "negative", unit: "分", reference: { min: 0, max: 100 }, weight: 0.4, level: 2 },
          ],
        },
        {
          id: "d6-c5",
          name: "工商风险",
          desc: "工商变更与股权异常",
          source: "[PDF公开]",
          level: 1,
          children: [
            { id: "d6-c5-i1", name: "股权冻结/质押", desc: "股权冻结或高比例质押情况（专家评分）", direction: "negative", unit: "分", reference: { min: 0, max: 100 }, weight: 1.0, level: 2 },
          ],
        },
        {
          id: "d6-c6",
          name: "宏观风险",
          desc: "宏观环境与行业周期风险",
          source: "[PDF公开]",
          level: 1,
          children: [
            { id: "d6-c6-i1", name: "宏观敏感度", desc: "经营对宏观周期/大宗商品/汇率的敏感程度（专家评分）", direction: "negative", unit: "分", reference: { min: 0, max: 100 }, weight: 1.0, level: 2 },
          ],
        },
        {
          id: "d6-c7",
          name: "外迁风险",
          desc: "注册地或经营地外迁风险",
          source: "[PDF公开]",
          level: 1,
          children: [
            { id: "d6-c7-i1", name: "外迁风险指数", desc: "是否存在注册地/经营地迁移迹象（专家评分）", direction: "negative", unit: "分", reference: { min: 0, max: 100 }, weight: 1.0, level: 2 },
          ],
        },
        {
          id: "d6-c8",
          name: "内部报送风险",
          desc: "内部管理与报送合规",
          source: "[PDF公开]",
          level: 1,
          children: [
            { id: "d6-c8-i1", name: "报送合规度", desc: "对监管/合作方报送及时准确程度（专家评分，高=合规）", direction: "positive", unit: "分", reference: { min: 0, max: 100 }, weight: 1.0, level: 2 },
          ],
        },
      ],
    },
    {
      id: "d7",
      name: "成长与生态",
      desc: "商业模式可持续性与生态协同（第7维度，依据方案推演补齐）",
      source: "[推演补齐]",
      level: 0,
      children: [
        {
          id: "d7-c1",
          name: "商业模式",
          desc: "模式的可复制性与盈利前景",
          source: "[推演补齐]",
          level: 1,
          children: [
            { id: "d7-c1-i1", name: "模式可复制性", desc: "业务模式可复制、规模化难易度（专家评分）", direction: "positive", unit: "分", reference: { min: 0, max: 100 }, weight: 0.4, level: 2 },
            { id: "d7-c1-i2", name: "盈利前景", desc: "盈亏平衡与长期盈利预期（专家评分）", direction: "positive", unit: "分", reference: { min: 0, max: 100 }, weight: 0.3, level: 2 },
            { id: "d7-c1-i3", name: "商业模式清晰度", desc: "商业模式是否清晰可解释（专家评分）", direction: "positive", unit: "分", reference: { min: 0, max: 100 }, weight: 0.3, level: 2 },
          ],
        },
        {
          id: "d7-c2",
          name: "生态协同",
          desc: "上下游与平台协同",
          source: "[推演补齐]",
          level: 1,
          children: [
            { id: "d7-c2-i1", name: "上下游协同度", desc: "与产业链上下游的合作深度（专家评分）", direction: "positive", unit: "分", reference: { min: 0, max: 100 }, weight: 0.5, level: 2 },
            { id: "d7-c2-i2", name: "生态伙伴数量", desc: "合作生态伙伴数量与质量（专家评分）", direction: "positive", unit: "分", reference: { min: 0, max: 100 }, weight: 0.5, level: 2 },
          ],
        },
      ],
    },
  ],

  /**
   * 场景权重（维度级权重，合计=1）
   * investment    投资参考
   * diligence     创业尽调
   * job           求职择业
   * cooperation   合作评估
   * custom        用户自定义（UI 修改）
   */
  scenarios: {
    investment: {
      id: "investment",
      name: "投资参考",
      desc: "适合个人投资者评估标的企业投资价值",
      weights: { d1: 0.15, d2: 0.25, d3: 0.10, d4: 0.15, d5: 0.10, d6: 0.20, d7: 0.05 },
    },
    diligence: {
      id: "diligence",
      name: "创业尽调",
      desc: "适合创业者/尽调机构评估目标企业的全面状况",
      weights: { d1: 0.10, d2: 0.20, d3: 0.15, d4: 0.15, d5: 0.10, d6: 0.25, d7: 0.05 },
    },
    job: {
      id: "job",
      name: "求职择业",
      desc: "适合求职者评估目标公司的稳定性与发展前景",
      weights: { d1: 0.10, d2: 0.20, d3: 0.20, d4: 0.10, d5: 0.05, d6: 0.30, d7: 0.05 },
    },
    cooperation: {
      id: "cooperation",
      name: "合作评估",
      desc: "适合小微企业主评估潜在业务合作伙伴",
      weights: { d1: 0.10, d2: 0.20, d3: 0.20, d4: 0.10, d5: 0.05, d6: 0.25, d7: 0.10 },
    },
  },

  /** 从维度 id 查所有二级指标（展平） */
  flatten() {
    const flat = [];
    this.dimensions.forEach((d) => {
      d.children.forEach((c) => {
        c.children.forEach((i) => {
          flat.push({ dimension: d.id, dimensionName: d.name, parent: c.id, parentName: c.name, ...i });
        });
      });
    });
    return flat;
  },

  /** 校验指标数量 */
  count() {
    let d = this.dimensions.length;
    let l1 = 0;
    let l2 = 0;
    this.dimensions.forEach((dm) => { l1 += dm.children.length; dm.children.forEach((c) => { l2 += c.children.length; }); });
    return { dimensions: d, level1: l1, level2: l2 };
  },
};

// 兼容浏览器（script 标签）与 Node（require）
if (typeof globalThis !== "undefined") {
  globalThis.QB_INDICATORS = QB_INDICATORS;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = QB_INDICATORS;
}