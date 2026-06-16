import { ArrowRight, CheckCircle, ExternalLink, FileJson, KeyRound, MapPin, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import GlassCard from '../components/ui/GlassCard'
import GlowButton from '../components/ui/GlowButton'

interface GuideStep {
  title: string
  description: string
}

interface ApiGuide {
  title: string
  badge: string
  required: boolean
  purpose: string
  applyWhere: string
  fillWhere: string
  testHow: string
  steps: GuideStep[]
  links: Array<{ label: string; href: string }>
}

const setupFlow = [
  '先设置本机访问口令并进入系统',
  '在系统设置导入 Google 服务账号 JSON',
  '在 Search Console 给服务账号邮箱授权',
  '到站点管理创建站点并选择 GSC 属性',
  '保存并测试连接，测试通过后再启用站点',
  '按需补充 PSI、GA4、Shopify 或 WordPress',
]

const apiGuides: ApiGuide[] = [
  {
    title: 'Google Search Console',
    badge: '必填',
    required: true,
    purpose: '读取搜索流量、曝光、点击、排名和页面关键词，是软件的核心数据来源。',
    applyWhere: 'Google Cloud 创建服务账号并下载 JSON 密钥；Search Console 中给服务账号邮箱添加该站点权限。',
    fillWhere: '系统设置 -> Google API 凭据 -> 导入 Google JSON 密钥文件；站点管理 -> GSC 属性 URL。',
    testHow: '站点管理 -> 保存并测试连接，或在站点卡片点击“测试 GSC”。',
    steps: [
      { title: '创建 Google Cloud 项目', description: '进入 Google Cloud Console，新建或选择一个项目。' },
      { title: '启用 Search Console API', description: '在 API 和服务里启用 Search Console API。' },
      { title: '创建服务账号并下载 JSON', description: 'IAM 与管理 -> 服务账号 -> 创建服务账号 -> 密钥 -> 新建 JSON 密钥。' },
      { title: '把邮箱加到 Search Console', description: '复制 JSON 里的 client_email，在 Search Console 对应资源里添加用户权限。' },
      { title: '回到软件导入 JSON', description: '不要复制私钥文本，直接选择下载的 JSON 文件导入。' },
    ],
    links: [
      { label: 'Google Cloud 服务账号', href: 'https://docs.cloud.google.com/iam/docs/service-accounts-create' },
      { label: '创建服务账号凭据', href: 'https://developers.google.com/workspace/guides/create-credentials' },
      { label: 'Search Console', href: 'https://search.google.com/search-console/about' },
    ],
  },
  {
    title: 'PageSpeed Insights',
    badge: '推荐',
    required: false,
    purpose: '抓取页面性能、LCP、CLS 等速度指标，用于速度看板和页面优化优先级。',
    applyWhere: 'Google Cloud -> API 和服务 -> 启用 PageSpeed Insights API -> 凭据 -> 创建 API 密钥。',
    fillWhere: '系统设置 -> PageSpeed Insights -> PSI API 密钥。',
    testHow: '添加 URL 后运行任务或进入速度看板观察是否产生性能数据。',
    steps: [
      { title: '启用 PSI API', description: '在同一个 Google Cloud 项目里启用 PageSpeed Insights API。' },
      { title: '创建 API Key', description: '进入凭据页面创建 API 密钥。建议后续在 Google Cloud 里限制 API 使用范围。' },
      { title: '填入软件', description: '在系统设置的 PSI API 密钥框保存即可。' },
    ],
    links: [
      { label: 'PageSpeed Insights API 说明', href: 'https://developers.google.com/speed/docs/insights/v5/get-started' },
      { label: 'PageSpeed Insights REST API', href: 'https://developers.google.com/speed/docs/insights/rest' },
    ],
  },
  {
    title: 'Google Analytics 4',
    badge: '可选',
    required: false,
    purpose: '读取转化、跳出率等业务指标，让 SEO 任务能结合 ROI 判断优先级。',
    applyWhere: 'Google Analytics 后台。你需要 GA4 的数字 Property ID，不是 G- 开头的 Measurement ID。',
    fillWhere: '站点管理 -> 编辑站点 -> GA4 属性 ID。',
    testHow: '站点保存后，后续同步数据时会按该站点的 GA4 属性读取指标。',
    steps: [
      { title: '打开 GA4 管理页', description: '进入 Google Analytics，选择对应账号和媒体资源。' },
      { title: '找到 Property ID', description: '在属性设置里复制纯数字 Property ID。' },
      { title: '填到站点里', description: '每个站点可以填写自己的 GA4 Property ID。' },
    ],
    links: [
      { label: 'GA4 Property ID 官方说明', href: 'https://developers.google.com/analytics/devguides/reporting/data/v1/property-id' },
    ],
  },
  {
    title: 'Shopify Admin API',
    badge: '按站点需要',
    required: false,
    purpose: '同步 Shopify 商品/页面 URL，并在你确认后写回标题、描述等内容优化结果。',
    applyWhere: 'Shopify 后台 -> Apps and sales channels -> Develop apps -> 创建自定义应用 -> 配置 Admin API 权限 -> 安装应用 -> 复制 Admin API access token。',
    fillWhere: '站点管理 -> 平台类型选择 Shopify -> Shopify Access Token。',
    testHow: '站点管理 -> 保存并测试连接；通过后可同步 CMS URL。',
    steps: [
      { title: '创建自定义应用', description: '在目标 Shopify 店铺后台创建 Custom app。' },
      { title: '配置 Admin API scopes', description: '至少需要读取内容/商品相关权限；如果要写回优化内容，再添加对应写权限。' },
      { title: '安装应用并复制 token', description: 'Admin API access token 只显示一次，请复制后填入软件。' },
      { title: '测试连接', description: '保存站点后点击 CMS 测试，确认 token 和店铺匹配。' },
    ],
    links: [
      { label: 'Shopify 自定义应用说明', href: 'https://help.shopify.com/en/manual/apps/about-apps' },
      { label: 'Shopify Admin API access token', href: 'https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/generate-app-access-tokens-admin' },
      { label: 'Shopify Admin REST API', href: 'https://shopify.dev/docs/api/admin-rest' },
    ],
  },
  {
    title: 'WordPress REST API',
    badge: '按站点需要',
    required: false,
    purpose: '同步 WordPress 页面/文章 URL，并在你确认后写回标题、摘要等内容优化结果。',
    applyWhere: 'WordPress 后台 -> 用户 -> 个人资料 -> Application Passwords，创建应用密码。',
    fillWhere: '站点管理 -> 平台类型选择 WordPress -> WP API URL、用户名、应用程序密码。',
    testHow: '站点管理 -> 保存并测试连接；通过后可同步 CMS URL。',
    steps: [
      { title: '确认 REST API 地址', description: '通常是 https://你的域名/wp-json。' },
      { title: '创建应用程序密码', description: '在 WordPress 用户个人资料里创建 Application Password。它不是你的登录密码。' },
      { title: '填入用户名和应用密码', description: '用户名填 WordPress 用户名，密码填生成的一次性应用密码。' },
      { title: '测试连接', description: '测试通过后再启用该站点。' },
    ],
    links: [
      { label: 'WordPress Application Passwords', href: 'https://developer.wordpress.org/advanced-administration/security/application-passwords/' },
      { label: 'Application Passwords REST API', href: 'https://developer.wordpress.org/rest-api/reference/application-passwords/' },
    ],
  },
]

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold theme-text-primary">{children}</h2>
}

function ExternalGuideLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs"
      style={{ border: '1px solid var(--border-color)', color: 'var(--accent-cyan)' }}
    >
      {label}
      <ExternalLink size={12} />
    </a>
  )
}

export default function SetupGuide() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <GlassCard className="overflow-hidden">
        <div className="grid gap-6 p-6 lg:grid-cols-[1.25fr_0.75fr] lg:p-8">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs" style={{ backgroundColor: 'rgba(0,240,255,0.10)', color: 'var(--accent-cyan)' }}>
              <ShieldCheck size={14} />
              新手先看这里
            </div>
            <h1 className="text-3xl font-bold theme-text-primary">SiteOptimizer Pro 接入向导</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 theme-text-secondary">
              你不需要一次填完所有 API。先把 Google Search Console 跑通，软件就能开始读取搜索表现；
              PSI、GA4、Shopify、WordPress 都是按你的使用场景逐步补充。
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/settings">
                <GlowButton>
                  去系统设置导入 Google JSON
                  <ArrowRight size={15} />
                </GlowButton>
              </Link>
              <Link to="/websites">
                <GlowButton variant="secondary">
                  去站点管理创建站点
                  <MapPin size={15} />
                </GlowButton>
              </Link>
            </div>
          </div>

          <div className="rounded-2xl p-5" style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-input)' }}>
            <SectionTitle>最短可用路径</SectionTitle>
            <div className="mt-4 space-y-3">
              {setupFlow.map((item, index) => (
                <div key={item} className="flex gap-3">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold" style={{ backgroundColor: 'rgba(0,240,255,0.12)', color: 'var(--accent-cyan)' }}>
                    {index + 1}
                  </div>
                  <p className="text-sm leading-6 theme-text-primary">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <SectionTitle>这些字段到底填在哪里？</SectionTitle>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--bg-input)' }}>
            <FileJson size={20} style={{ color: 'var(--accent-cyan)' }} />
            <h3 className="mt-3 font-semibold theme-text-primary">Google JSON 密钥文件</h3>
            <p className="mt-2 text-sm leading-6 theme-text-secondary">填在“系统设置”。软件会自动读取 client_email、private_key、project_id，不需要你手动复制私钥。</p>
          </div>
          <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--bg-input)' }}>
            <MapPin size={20} style={{ color: 'var(--accent-purple)' }} />
            <h3 className="mt-3 font-semibold theme-text-primary">GSC 属性 URL / GA4 / CMS</h3>
            <p className="mt-2 text-sm leading-6 theme-text-secondary">都填在“站点管理”。这些是站点级配置，不是全局配置。</p>
          </div>
          <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--bg-input)' }}>
            <KeyRound size={20} style={{ color: 'var(--accent-success)' }} />
            <h3 className="mt-3 font-semibold theme-text-primary">PSI / 通知 Webhook</h3>
            <p className="mt-2 text-sm leading-6 theme-text-secondary">填在“系统设置”。属于全局工具，不绑定单个站点。</p>
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-6">
        {apiGuides.map(guide => (
          <GlassCard key={guide.title} className="p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-semibold theme-text-primary">{guide.title}</h2>
                  <span
                    className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                    style={{
                      color: guide.required ? 'var(--accent-error)' : 'var(--accent-cyan)',
                      backgroundColor: guide.required ? 'rgba(239,68,68,0.12)' : 'rgba(0,240,255,0.10)',
                    }}
                  >
                    {guide.badge}
                  </span>
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-6 theme-text-secondary">{guide.purpose}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {guide.links.map(link => <ExternalGuideLink key={link.href} {...link} />)}
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl p-4" style={{ border: '1px solid var(--border-color)' }}>
                <h3 className="text-sm font-semibold theme-text-primary">去哪申请</h3>
                <p className="mt-2 text-sm leading-6 theme-text-secondary">{guide.applyWhere}</p>
              </div>
              <div className="rounded-2xl p-4" style={{ border: '1px solid var(--border-color)' }}>
                <h3 className="text-sm font-semibold theme-text-primary">填到哪里</h3>
                <p className="mt-2 text-sm leading-6 theme-text-secondary">{guide.fillWhere}</p>
              </div>
              <div className="rounded-2xl p-4" style={{ border: '1px solid var(--border-color)' }}>
                <h3 className="text-sm font-semibold theme-text-primary">怎么确认能用</h3>
                <p className="mt-2 text-sm leading-6 theme-text-secondary">{guide.testHow}</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {guide.steps.map(step => (
                <div key={step.title} className="flex gap-3 rounded-xl p-3" style={{ backgroundColor: 'var(--bg-input)' }}>
                  <CheckCircle size={17} className="mt-0.5 shrink-0" style={{ color: 'var(--accent-success)' }} />
                  <div>
                    <p className="text-sm font-medium theme-text-primary">{step.title}</p>
                    <p className="mt-1 text-sm leading-6 theme-text-secondary">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        ))}
      </div>

      <GlassCard className="p-6">
        <SectionTitle>容易填错的地方</SectionTitle>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <p className="rounded-xl p-3 text-sm leading-6 theme-text-secondary" style={{ backgroundColor: 'var(--bg-input)' }}>
            GSC 域名资源格式是 <code>sc-domain:example.com</code>，URL 前缀资源格式是 <code>https://www.example.com/</code>。
          </p>
          <p className="rounded-xl p-3 text-sm leading-6 theme-text-secondary" style={{ backgroundColor: 'var(--bg-input)' }}>
            GA4 要填纯数字 Property ID，不是 <code>G-XXXX</code> 开头的 Measurement ID。
          </p>
          <p className="rounded-xl p-3 text-sm leading-6 theme-text-secondary" style={{ backgroundColor: 'var(--bg-input)' }}>
            Shopify token 和 WordPress 应用密码只在创建时完整显示一次，请保存到软件后妥善保管。
          </p>
          <p className="rounded-xl p-3 text-sm leading-6 theme-text-secondary" style={{ backgroundColor: 'var(--bg-input)' }}>
            不要把 Google JSON、Shopify token、WordPress 应用密码发到聊天或公开仓库。
          </p>
        </div>
      </GlassCard>
    </div>
  )
}
