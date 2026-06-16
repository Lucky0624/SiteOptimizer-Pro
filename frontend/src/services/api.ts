const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

function getAdminKey(): string {
  return localStorage.getItem('admin_key') || ''
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${path}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Admin-Key': getAdminKey(),
    ...(options.headers as Record<string, string> || {}),
  }

  const response = await fetch(url, { ...options, headers })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new ApiError(response.status, response.statusText, errorBody)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json()
}

export class ApiError extends Error {
  status: number
  statusText: string
  body: string

  constructor(status: number, statusText: string, body: string) {
    // 尝试从 body 中提取 detail 字段作为错误消息，方便 toast 显示
    let detail = body
    try {
      const parsed = JSON.parse(body)
      if (parsed.detail) detail = typeof parsed.detail === 'string' ? parsed.detail : JSON.stringify(parsed.detail)
    } catch {}
    super(detail || `API Error ${status}: ${statusText}`)
    this.status = status
    this.statusText = statusText
    this.body = body
  }
}

export interface TagResponse {
  id: number
  tag_type: string
  tag_name: string
  auto_applied: boolean
  created_at: string
}

export interface SnapshotResponse {
  id: number
  snapshot_date: string
  clicks: number
  impressions: number
  ctr: number
  position: number
  previous_clicks: number | null
  previous_impressions: number | null
  previous_ctr: number | null
  previous_position: number | null
  lcp_value: number | null
  cls_value: number | null
  fid_value: number | null
  performance_score: number | null
  bounce_rate: number | null
  conversions: number | null
}

export interface URLItem {
  id: number
  url: string
  title: string | null
  priority_score: number
  status: string
  last_crawled_at: string | null
  last_modified_at: string | null
  created_at: string
  updated_at: string | null
  website_id: number | null
  latest_snapshot?: SnapshotResponse | null
}

export interface URLDetailItem extends URLItem {
  tags: TagResponse[]
  snapshots: SnapshotResponse[]
}

export interface URLListResponse {
  items: URLItem[]
  total: number
  page: number
  page_size: number
}

export interface URLCreatePayload {
  url: string
  title?: string
  website_id?: number
}

export interface URLBatchCreatePayload {
  urls: URLCreatePayload[]
}

export interface URLUpdatePayload {
  title?: string | null
  status?: string | null
}

export interface SitemapImportPayload {
  sitemap_url: string
  website_id?: number | null
}

export interface SitemapImportResponse {
  imported: number
  skipped: number
  total_found: number
  sitemap_url: string
}

export type URLBatchAction = 'archive' | 'recrawl' | 'delete'

export interface URLBatchActionResponse {
  status: string
  action: string
  affected: number
}

export interface URLExportParams {
  website_id?: number
  tag?: string
  status?: string
}

export interface QuotaStatusItem {
  api_type: string
  used: number
  limit: number
  remaining: number
}

export interface QuotaStatusResponse {
  date: string
  quotas: QuotaStatusItem[]
}

export interface QuotaHistoryItem {
  id: number
  api_type: string
  usage_date: string
  used_count: number
  limit_count: number
}

export interface TaskItem {
  id: number
  url_id: number
  task_type: string
  priority_score: number
  status: string
  scheduled_date: string
  executed_at: string | null
  result_summary: string | null
  error_message: string | null
  retry_count: number
  max_retries: number
  created_at: string
}

export interface TaskListResponse {
  items: TaskItem[]
  total: number
  page: number
  page_size: number
}

export interface TaskStats {
  pending: number
  running: number
  completed: number
  failed: number
  deferred: number
  total: number
}

export interface WebsiteResponse {
  id: number
  name: string
  domain: string
  site_type: string
  gsc_site_url: string | null
  shopify_access_token: string | null
  wp_username: string | null
  wp_app_password: string | null
  wp_api_url: string | null
  ga4_property_id: string | null
  is_active: boolean
  gsc_verified_at: string | null
  cms_verified_at: string | null
  created_at: string
  updated_at: string | null
}

export interface WebsiteListResponse {
  items: WebsiteResponse[]
  total: number
}

export interface WebsiteCreatePayload {
  name: string
  domain: string
  site_type: string
  gsc_site_url?: string
  shopify_access_token?: string
  wp_username?: string
  wp_app_password?: string
  wp_api_url?: string
  ga4_property_id?: string
  is_active?: boolean
}

export interface WebsiteUpdatePayload {
  name?: string
  domain?: string
  site_type?: string
  gsc_site_url?: string
  shopify_access_token?: string | null
  wp_username?: string
  wp_app_password?: string | null
  wp_api_url?: string
  ga4_property_id?: string
  is_active?: boolean
}

export interface DashboardStats {
  total_urls: number
  indexed_count: number
  opportunity_count: number
  decaying_count: number
  quota_summary: QuotaStatusItem[]
}

export interface TrendDataPoint {
  date: string
  clicks: number
  impressions: number
  ctr: number
  position: number
  conversions: number
}

export interface DashboardTrendsResponse {
  period_days: number
  data: TrendDataPoint[]
}

export interface TopOpportunityItem {
  url_id: number
  url: string
  priority_score: number
  impressions: number
  position: number
  ctr: number
}

export interface TopOpportunitiesResponse {
  items: TopOpportunityItem[]
}

export interface DecayingURLItem {
  url_id: number
  url: string
  priority_score: number
  clicks: number
  previous_clicks: number | null
  drop_percent: number | null
}

export interface DecayingURLsResponse {
  items: DecayingURLItem[]
}

export interface KeywordItem {
  keyword: string
  clicks: number
  impressions: number
  ctr: number
  position: number
  snapshot_date: string
}

export interface KeywordListResponse {
  url_id: number | null
  url: string | null
  items: KeywordItem[]
  total: number
}

export interface KeywordCollectResponse {
  status: string
  urls_scanned: number
  keywords_imported: number
  skipped_quota: number
  errors: Array<{ url_id: number; error: string }>
}

export interface KeywordPageMapItem {
  url_id: number
  url: string
  title: string | null
  keyword_count: number
  clicks: number
  impressions: number
  avg_position: number
  top_keywords: KeywordItem[]
}

export interface KeywordClusterItem {
  cluster: string
  keyword_count: number
  clicks: number
  impressions: number
  avg_position: number
  keywords: string[]
}

export interface KeywordTrendPoint {
  date: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface CMSContentResponse {
  platform: string
  resource_type: string
  resource_id: string
  resource_parent_id: string | null
  url: string
  title: string
  admin_title: string | null
  meta_description: string | null
  content_text: string | null
}

export interface ContentOptimizationItem {
  id: number
  website_id: number
  url_id: number
  platform: string
  resource_type: string
  resource_id: string
  resource_parent_id: string | null
  resource_url: string
  current_title: string | null
  current_meta_description: string | null
  current_content_excerpt: string | null
  suggested_title: string
  suggested_meta_description: string
  suggested_content_excerpt: string | null
  primary_keyword: string | null
  supporting_keywords: string[] | null
  missing_keywords: string[] | null
  content_gap_summary: string | null
  status: string
  error_message: string | null
  created_at: string
  updated_at: string | null
  approved_at: string | null
  applied_at: string | null
}

export interface GoogleCredentialImportResponse {
  status: string
  configured: boolean
  client_email: string
  project_id: string
}

export interface SecretStatusItem {
  configured: boolean
  updated_at: string | null
}

export interface GlobalSecretStatus {
  GOOGLE_PRIVATE_KEY: SecretStatusItem
  GOOGLE_PSI_API_KEY: SecretStatusItem
  DINGTALK_WEBHOOK_URL: SecretStatusItem
  WECOM_WEBHOOK_URL: SecretStatusItem
}

export interface GscSiteEntry {
  site_url: string
  permission_level: string
}

export const api = {
  urls: {
    list: (params?: { page?: number; page_size?: number; tag?: string; status?: string; search?: string; sort_by?: string; sort_order?: string; website_id?: number }) => {
      const query = new URLSearchParams()
      if (params?.page) query.set('page', String(params.page))
      if (params?.page_size) query.set('page_size', String(params.page_size))
      if (params?.tag) query.set('tag', params.tag)
      if (params?.status) query.set('status', params.status)
      if (params?.search) query.set('search', params.search)
      if (params?.sort_by) query.set('sort_by', params.sort_by)
      if (params?.sort_order) query.set('sort_order', params.sort_order)
      if (params?.website_id) query.set('website_id', String(params.website_id))
      const qs = query.toString()
      return request<URLListResponse>(`/urls${qs ? `?${qs}` : ''}`)
    },
    create: (data: URLCreatePayload) =>
      request<URLItem[]>('/urls', { method: 'POST', body: JSON.stringify(data) }),
    createBatch: (data: URLBatchCreatePayload) =>
      request<URLItem[]>('/urls', { method: 'POST', body: JSON.stringify(data) }),
    get: (id: number) =>
      request<URLDetailItem>(`/urls/${id}`),
    update: (id: number, data: URLUpdatePayload) =>
      request<URLItem>(`/urls/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) =>
      request<URLItem>(`/urls/${id}`, { method: 'DELETE' }),
    markRecrawl: (id: number) =>
      request<URLItem>(`/urls/${id}/recrawl`, { method: 'POST' }),
    importSitemap: (data: SitemapImportPayload) =>
      request<SitemapImportResponse>('/urls/import-sitemap', { method: 'POST', body: JSON.stringify(data) }),
    batchAction: (action: URLBatchAction, ids: number[]) =>
      request<URLBatchActionResponse>('/urls/batch', {
        method: 'POST',
        body: JSON.stringify({ action, ids }),
      }),
    exportCsv: (params: URLExportParams = {}) => {
      const query = new URLSearchParams()
      if (params.website_id) query.set('website_id', String(params.website_id))
      if (params.tag) query.set('tag', params.tag)
      if (params.status) query.set('status', params.status)
      const qs = query.toString()
      return fetch(`${BASE_URL}/urls/export${qs ? `?${qs}` : ''}`, {
        headers: { 'X-Admin-Key': getAdminKey() },
      }).then(res => {
        if (!res.ok) throw new Error(`Export failed: ${res.status}`)
        return res.blob()
      }).then(blob => {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `urls_export_${Date.now()}.csv`
        link.click()
        URL.revokeObjectURL(url)
      })
    },
  },

  quota: {
    getStatus: () =>
      request<QuotaStatusResponse>('/quota/status'),
    getHistory: (days?: number) => {
      const query = days ? `?days=${days}` : ''
      return request<QuotaHistoryItem[]>(`/quota/history${query}`)
    },
  },

  tasks: {
    list: (params?: { page?: number; page_size?: number; status?: string; task_type?: string; website_id?: number }) => {
      const query = new URLSearchParams()
      if (params?.page) query.set('page', String(params.page))
      if (params?.page_size) query.set('page_size', String(params.page_size))
      if (params?.status) query.set('status', params.status)
      if (params?.task_type) query.set('task_type', params.task_type)
      if (params?.website_id) query.set('website_id', String(params.website_id))
      const qs = query.toString()
      return request<TaskListResponse>(`/tasks${qs ? `?${qs}` : ''}`)
    },
    allocate: (website_id?: number) =>
      request<{ tasks_created: number }>(`/tasks/allocate${website_id ? `?website_id=${website_id}` : ''}`, { method: 'POST' }),
    retry: (id: number) =>
      request<TaskItem>(`/tasks/${id}/retry`, { method: 'POST' }),
    process: (website_id?: number) =>
      request<{ tasks_processed: number }>(`/tasks/process${website_id ? `?website_id=${website_id}` : ''}`, { method: 'POST' }),
    getStats: (website_id?: number) =>
      request<TaskStats>(`/tasks/stats${website_id ? `?website_id=${website_id}` : ''}`),
  },

  dashboard: {
    getStats: (website_id?: number) => {
      const query = website_id ? `?website_id=${website_id}` : ''
      return request<DashboardStats>(`/dashboard/stats${query}`)
    },
    getTrends: (days?: number, website_id?: number) => {
      const query = new URLSearchParams()
      if (days) query.set('days', String(days))
      if (website_id) query.set('website_id', String(website_id))
      const qs = query.toString()
      return request<DashboardTrendsResponse>(`/dashboard/trends${qs ? `?${qs}` : ''}`)
    },
    getTopOpportunities: (limit?: number, website_id?: number) => {
      const query = new URLSearchParams()
      if (limit) query.set('limit', String(limit))
      if (website_id) query.set('website_id', String(website_id))
      const qs = query.toString()
      return request<TopOpportunitiesResponse>(`/dashboard/top-opportunities${qs ? `?${qs}` : ''}`)
    },
    getDecaying: (limit?: number, website_id?: number) => {
      const query = new URLSearchParams()
      if (limit) query.set('limit', String(limit))
      if (website_id) query.set('website_id', String(website_id))
      const qs = query.toString()
      return request<DecayingURLsResponse>(`/dashboard/decaying${qs ? `?${qs}` : ''}`)
    },
    runCycle: (website_id?: number) =>
      request<{ status: string; result: any }>(`/dashboard/run-cycle${website_id ? `?website_id=${website_id}` : ''}`, { method: 'POST' }),
  },

  settings: {
    getAll: () => request<Record<string, string>>('/settings'),
    update: (payload: { key: string; value: string }[]) =>
      request<{ status: string }>('/settings', { method: 'POST', body: JSON.stringify(payload) }),
    importGoogleCredentials: (credentialsJson: string) =>
      request<GoogleCredentialImportResponse>('/settings/google-credentials', {
        method: 'POST',
        body: JSON.stringify({ credentials_json: credentialsJson }),
      }),
    clearGoogleCredentials: () =>
      request<{ status: string }>('/settings/google-credentials', { method: 'DELETE' }),
    getSecretStatus: () =>
      request<GlobalSecretStatus>('/settings/secret-status'),
    clearSecret: (key: 'GOOGLE_PSI_API_KEY' | 'DINGTALK_WEBHOOK_URL' | 'WECOM_WEBHOOK_URL') =>
      request<{ status: string }>(`/settings/secrets/${key}`, { method: 'DELETE' }),
    listGscSites: () =>
      request<GscSiteEntry[]>('/settings/gsc-sites'),
    testGsc: () =>
      request<{ status: string; message: string }>('/settings/test-gsc'),
  },

  websites: {
    list: (params?: { page?: number; page_size?: number; site_type?: string; search?: string }) => {
      const query = new URLSearchParams()
      if (params?.page) query.set('page', String(params.page))
      if (params?.page_size) query.set('page_size', String(params.page_size))
      if (params?.site_type) query.set('site_type', params.site_type)
      if (params?.search) query.set('search', params.search)
      const qs = query.toString()
      return request<WebsiteListResponse>(`/websites${qs ? `?${qs}` : ''}`)
    },
    listAll: async () => {
      const first = await request<WebsiteListResponse>('/websites?page=1&page_size=100')
      if (first.total <= first.items.length) return first.items
      const pageCount = Math.ceil(first.total / 100)
      const pages = await Promise.all(
        Array.from({ length: pageCount - 1 }, (_, index) =>
          request<WebsiteListResponse>(`/websites?page=${index + 2}&page_size=100`)
        )
      )
      return [first, ...pages].flatMap(result => result.items)
    },
    get: (id: number) => request<WebsiteResponse>(`/websites/${id}`),
    create: (data: WebsiteCreatePayload) =>
      request<WebsiteResponse>('/websites', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: WebsiteUpdatePayload) =>
      request<WebsiteResponse>(`/websites/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) =>
      request<{ status: string }>(`/websites/${id}`, { method: 'DELETE' }),
    testGsc: (id: number) =>
      request<{ ok: boolean; message: string; verified_at: string }>(`/websites/${id}/test-gsc`, { method: 'POST' }),
  },

  cms: {
    sync: (websiteId: number) =>
      request<{ status: string; imported: number; skipped: number; total_found: number }>(
        `/cms/${websiteId}/sync`, { method: 'POST' }
      ),
    status: (websiteId: number) =>
      request<{ website_id: number; site_type: string; total_urls: number; last_url_added_at: string | null }>(
        `/cms/${websiteId}/status`
      ),
    test: (websiteId: number) =>
      request<{ ok: boolean; error?: string; shop_name?: string; username?: string; verified_at?: string }>(
        `/cms/${websiteId}/test`, { method: 'POST' }
      ),
    content: (websiteId: number, urlId: number) =>
      request<CMSContentResponse>(`/cms/${websiteId}/content?url_id=${urlId}`),
    createOptimization: (websiteId: number, urlId: number) =>
      request<ContentOptimizationItem>(`/cms/${websiteId}/optimizations`, {
        method: 'POST',
        body: JSON.stringify({ url_id: urlId }),
      }),
    listOptimizations: (websiteId: number, params?: { status?: string; url_id?: number }) => {
      const q = new URLSearchParams()
      if (params?.status) q.set('status', params.status)
      if (params?.url_id) q.set('url_id', String(params.url_id))
      const qs = q.toString()
      return request<ContentOptimizationItem[]>(`/cms/${websiteId}/optimizations${qs ? `?${qs}` : ''}`)
    },
    updateOptimization: (
      websiteId: number,
      optimizationId: number,
      data: { suggested_title: string; suggested_meta_description: string }
    ) =>
      request<ContentOptimizationItem>(`/cms/${websiteId}/optimizations/${optimizationId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    approveOptimization: (websiteId: number, optimizationId: number) =>
      request<ContentOptimizationItem>(`/cms/${websiteId}/optimizations/${optimizationId}/approve`, { method: 'POST' }),
    rejectOptimization: (websiteId: number, optimizationId: number) =>
      request<ContentOptimizationItem>(`/cms/${websiteId}/optimizations/${optimizationId}/reject`, { method: 'POST' }),
    applyOptimization: (websiteId: number, optimizationId: number) =>
      request<ContentOptimizationItem>(`/cms/${websiteId}/optimizations/${optimizationId}/apply`, {
        method: 'POST',
      }),
  },

  keywords: {
    list: (params: {
      website_id?: number
      url_id?: number
      days?: number
      search?: string
      sort_by?: string
      page?: number
      page_size?: number
    }) => {
      const q = new URLSearchParams()
      if (params.website_id) q.set('website_id', String(params.website_id))
      if (params.url_id) q.set('url_id', String(params.url_id))
      if (params.days) q.set('days', String(params.days))
      if (params.search) q.set('search', params.search)
      if (params.sort_by) q.set('sort_by', params.sort_by)
      if (params.page) q.set('page', String(params.page))
      if (params.page_size) q.set('page_size', String(params.page_size))
      return request<KeywordListResponse>(`/keywords?${q.toString()}`)
    },
    fetch: (url_id: number, days?: number) => {
      const q = new URLSearchParams({ url_id: String(url_id) })
      if (days) q.set('days', String(days))
      return request<{ status: string; keywords_found: number; imported: number }>(
        `/keywords/fetch?${q.toString()}`, { method: 'POST' }
      )
    },
    collect: (website_id: number, days = 30, limit = 20) =>
      request<KeywordCollectResponse>('/keywords/collect', {
        method: 'POST',
        body: JSON.stringify({ website_id, days, limit }),
      }),
    pageMap: (params: { website_id?: number; days?: number; limit?: number }) => {
      const q = new URLSearchParams()
      if (params.website_id) q.set('website_id', String(params.website_id))
      if (params.days) q.set('days', String(params.days))
      if (params.limit) q.set('limit', String(params.limit))
      return request<KeywordPageMapItem[]>(`/keywords/page-map?${q.toString()}`)
    },
    clusters: (params: { website_id?: number; days?: number; limit?: number }) => {
      const q = new URLSearchParams()
      if (params.website_id) q.set('website_id', String(params.website_id))
      if (params.days) q.set('days', String(params.days))
      if (params.limit) q.set('limit', String(params.limit))
      return request<KeywordClusterItem[]>(`/keywords/clusters?${q.toString()}`)
    },
    trends: (params: { website_id?: number; url_id?: number; keyword?: string; days?: number }) => {
      const q = new URLSearchParams()
      if (params.website_id) q.set('website_id', String(params.website_id))
      if (params.url_id) q.set('url_id', String(params.url_id))
      if (params.keyword) q.set('keyword', params.keyword)
      if (params.days) q.set('days', String(params.days))
      return request<KeywordTrendPoint[]>(`/keywords/trends?${q.toString()}`)
    },
  },
}
