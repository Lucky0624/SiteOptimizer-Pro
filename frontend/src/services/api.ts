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
    super(`API Error ${status}: ${statusText}`)
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
  shopify_access_token?: string
  wp_username?: string
  wp_app_password?: string
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
    list: (params?: { page?: number; page_size?: number; status?: string; task_type?: string }) => {
      const query = new URLSearchParams()
      if (params?.page) query.set('page', String(params.page))
      if (params?.page_size) query.set('page_size', String(params.page_size))
      if (params?.status) query.set('status', params.status)
      if (params?.task_type) query.set('task_type', params.task_type)
      const qs = query.toString()
      return request<TaskListResponse>(`/tasks${qs ? `?${qs}` : ''}`)
    },
    allocate: () =>
      request<{ tasks_created: number }>('/tasks/allocate', { method: 'POST' }),
    retry: (id: number) =>
      request<TaskItem>(`/tasks/${id}/retry`, { method: 'POST' }),
    process: () =>
      request<{ tasks_processed: number }>('/tasks/process', { method: 'POST' }),
    getStats: () =>
      request<TaskStats>('/tasks/stats'),
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
    runCycle: () =>
      request<{ status: string; result: any }>('/dashboard/run-cycle', { method: 'POST' }),
  },
  
  settings: {
    getAll: () => request<Record<string, string>>('/settings'),
    update: (payload: { key: string; value: string }[]) =>
      request<{ status: string }>('/settings', { method: 'POST', body: JSON.stringify(payload) }),
  },

  websites: {
    list: (params?: { page?: number; page_size?: number; site_type?: string }) => {
      const query = new URLSearchParams()
      if (params?.page) query.set('page', String(params.page))
      if (params?.page_size) query.set('page_size', String(params.page_size))
      if (params?.site_type) query.set('site_type', params.site_type)
      const qs = query.toString()
      return request<WebsiteListResponse>(`/websites${qs ? `?${qs}` : ''}`)
    },
    get: (id: number) => request<WebsiteResponse>(`/websites/${id}`),
    create: (data: WebsiteCreatePayload) =>
      request<WebsiteResponse>('/websites', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: WebsiteUpdatePayload) =>
      request<WebsiteResponse>(`/websites/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) =>
      request<{ status: string }>(`/websites/${id}`, { method: 'DELETE' }),
  },
}
