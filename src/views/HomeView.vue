<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, inject } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance } from 'element-plus'
import api from '../api'

const router = useRouter()

// 注入认证状态
const authState = inject<{
  isAuthenticated: { value: boolean }
  setAuthenticated: () => void
  waitForAuth: () => Promise<void>
}>('authState')!

const loading = ref(false)
const actionLoading = reactive<Record<string, boolean>>({})
const searchForm = reactive({
  name: '',
  orderType: 1,
  cityCode: null as number | null,
  latitude: '',
  longitude: '',
  onlyAvailable: false,
  within3km: false,
  pageNum: 1,
  pageSize: 30,
})
const pagination = reactive({
  currentPage: 1,
  hasNextPage: true,
  isLoadingMore: false,
})

let scrollObserver: IntersectionObserver | null = null
const loadMoreTrigger = ref<HTMLElement | null>(null)
const storeList = ref<any[]>([])

// Address selection
const selectedAddress = ref<any>(null)
const selectedAddressId = ref<string | null>(null)
const addressOptions = ref<any[]>([])
const addressLoading = ref(false)
const addressPopoverVisible = ref(false)
const addressSearchKeyword = ref('')
let addressSearchTimer: ReturnType<typeof setTimeout> | null = null

// Notify config dialog
const notifyConfigVisible = ref(false)
const notifyConfigSaving = ref(false)
const notifyConfigFormRef = ref<FormInstance>()
const notifyConfigForm = reactive({
  startHour: 8,
  endHour: 22,
  weeks: [] as string[],
  cron: '',
})
const notifyConfigCronCollapseActive = ref<string[]>([])
const notifyConfigRules = {
  startHour: [
    {
      validator: (_rule: any, value: number, callback: any) => {
        if (!notifyConfigForm.cron && (value === null || value === undefined)) {
          callback(new Error('未填写 cron 时，开始时间必填'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
  endHour: [
    {
      validator: (_rule: any, value: number, callback: any) => {
        if (!notifyConfigForm.cron && (value === null || value === undefined)) {
          callback(new Error('未填写 cron 时，结束时间必填'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
  weeks: [
    {
      validator: (_rule: any, value: string[], callback: any) => {
        if (!notifyConfigForm.cron && (!value || value.length === 0)) {
          callback(new Error('未填写 cron 时，请至少选择一天'))
        } else {
          callback()
        }
      },
      trigger: 'change',
    },
  ],
  cron: [
    {
      validator: (_rule: any, value: string, callback: any) => {
        const trimmed = value ? value.trim() : ''
        if (!trimmed) {
          if (!notifyConfigForm.startHour || !notifyConfigForm.endHour || !notifyConfigForm.weeks || notifyConfigForm.weeks.length === 0) {
            callback(new Error('未填写 cron 时，开始时间、结束时间、运行星期必须填写'))
          } else {
            callback()
          }
        } else {
          const parts = trimmed.split(/\s+/)
          if (parts.length !== 6) {
            callback(new Error('cron 表达式应为 6 位，以空格分隔（含秒），如：0 15 9 * * ?'))
          } else {
            callback()
          }
        }
      },
      trigger: 'blur',
    },
  ],
}
const weekOptions = [
  { label: '周一', value: '1' },
  { label: '周二', value: '2' },
  { label: '周三', value: '3' },
  { label: '周四', value: '4' },
  { label: '周五', value: '5' },
  { label: '周六', value: '6' },
  { label: '周日', value: '7' },
]
const currentNotifyStore = ref<any>(null)
const defaultCityCode = 110100

const loadedPages = computed(() => {
  return Math.ceil(storeList.value.length / searchForm.pageSize)
})

async function handleSearch(resetPage = true) {
  if (resetPage) {
    searchForm.pageNum = 1
    pagination.currentPage = 1
    pagination.hasNextPage = true
  }

  loading.value = resetPage

  try {
    const response = await api.post('/api/xiaochan/query', searchForm)
    if (response.data.success) {
      const newData = response.data.data || []
      if (resetPage) {
        storeList.value = newData
      } else {
        storeList.value = [...storeList.value, ...newData]
      }
      pagination.hasNextPage = newData.length >= searchForm.pageSize
    } else {
      ElMessage.error(response.data.msg || '查询失败')
      if (!resetPage) {
        pagination.currentPage--
        searchForm.pageNum = pagination.currentPage
      }
    }
  } catch {
    ElMessage.error('网络错误，请稍后重试')
    if (!resetPage) {
      pagination.currentPage--
      searchForm.pageNum = pagination.currentPage
    }
  } finally {
    loading.value = false
    pagination.isLoadingMore = false
    nextTick(() => {
      reinitScrollObserver()
    })
  }
}

function handleSort(orderType: number) {
  searchForm.orderType = orderType
  handleSearch()
}

function initScrollObserver() {
  nextTick(() => {
    if (loadMoreTrigger.value) {
      scrollObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (
              entry.isIntersecting &&
              pagination.hasNextPage &&
              !pagination.isLoadingMore &&
              !loading.value
            ) {
              loadNextPage()
            }
          })
        },
        { rootMargin: '300px', threshold: 0.1 },
      )
      scrollObserver.observe(loadMoreTrigger.value)
    }
  })
}

function reinitScrollObserver() {
  if (scrollObserver) {
    scrollObserver.disconnect()
  }
  initScrollObserver()
}

async function loadNextPage() {
  if (!pagination.hasNextPage || pagination.isLoadingMore || loading.value) {
    return
  }
  pagination.isLoadingMore = true
  pagination.currentPage++
  searchForm.pageNum = pagination.currentPage
  await handleSearch(false)
}

async function refreshCurrentPageData() {
  const originalPageNum = searchForm.pageNum
  const originalCurrentPage = pagination.currentPage

  try {
    let allData: any[] = []
    for (let page = 1; page <= originalCurrentPage; page++) {
      searchForm.pageNum = page
      const pageResponse = await api.post('/api/xiaochan/query', searchForm)
      if (pageResponse.data.success && pageResponse.data.data) {
        const pageData = pageResponse.data.data
        allData = [...allData, ...pageData]
        if (page === originalCurrentPage) {
          pagination.hasNextPage = pageData.length >= searchForm.pageSize
        }
        if (pageData.length < searchForm.pageSize) {
          pagination.hasNextPage = false
          break
        }
      } else {
        break
      }
    }
    storeList.value = allData
    nextTick(() => {
      reinitScrollObserver()
    })
  } catch {
    ElMessage.error('刷新数据失败，请稍后重试')
  } finally {
    searchForm.pageNum = originalPageNum
    pagination.currentPage = originalCurrentPage
  }
}

function handleBook(store: any) {
  currentNotifyStore.value = store
  notifyConfigForm.startHour = 8
  notifyConfigForm.endHour = 22
  notifyConfigForm.weeks = []
  notifyConfigForm.cron = ''
  notifyConfigCronCollapseActive.value = []
  notifyConfigVisible.value = true
}

function getPlatformName(type: number) {
  const platforms: Record<number, string> = { 1: '美团', 2: '饿了么', 3: '京东' }
  return platforms[type] || '未知'
}

function getPlatformClass(type: number) {
  const classes: Record<number, string> = {
    1: 'platform-tag platform-meituan',
    2: 'platform-tag platform-eleme',
    3: 'platform-tag platform-jd',
  }
  return classes[type] || ''
}

function getRebateConditionText(condition: number) {
  const conditions: Record<number, string> = { 99: '无需评价', 2: '图文评价' }
  return conditions[condition] || '其他'
}

function formatDistance(distance: number) {
  if (distance < 1000) {
    return distance + 'm'
  } else {
    return (distance / 1000).toFixed(1) + 'km'
  }
}

function canApply(store: any) {
  if (store.leftNumber <= 0) return false
  const now = new Date()
  const currentTime =
    now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0')
  return currentTime >= store.startTime && currentTime <= store.endTime
}

function getCurrentLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        searchForm.latitude = position.coords.latitude.toString()
        searchForm.longitude = position.coords.longitude.toString()
      },
      () => {
        // ignore geolocation error
      },
    )
  }
}

function copyStoreName(name: string) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(name).then(() => {
      ElMessage.success('门店名称已复制')
    }).catch(() => {
      fallbackCopy(name)
    })
  } else {
    fallbackCopy(name)
  }
}

function fallbackCopy(name: string) {
  const textarea = document.createElement('textarea')
  textarea.value = name
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    document.execCommand('copy')
    ElMessage.success('门店名称已复制')
  } catch (err) {
    ElMessage.error('复制失败')
  } finally {
    document.body.removeChild(textarea)
  }
}

function goToAddressPage() {
  router.push('/location')
}

async function searchAddresses(keyword: string) {
  if (!keyword || keyword.trim().length < 2) {
    await loadLocalAddresses()
    return
  }

  addressLoading.value = true

  try {
    const cityCode = selectedAddress.value?.cityCode || defaultCityCode
    const response = await api.get('/api/location/searchAddress', {
      keyword: keyword.trim(),
      cityCode: cityCode,
    })
    if (response.data.success) {
      const searchResults = response.data.data || []
      searchResults.forEach((addr: any) => {
        addr._isSearchResult = true
        if (!addr.name && addr.title) {
          addr.name = addr.title
        }
      })
      addressOptions.value = searchResults
    } else {
      ElMessage.error(response.data.msg || '地址搜索失败')
      addressOptions.value = []
    }
  } catch {
    ElMessage.error('网络错误，请稍后重试')
    addressOptions.value = []
  } finally {
    addressLoading.value = false
  }
}

async function loadLocalAddresses() {
  try {
    const response = await api.get('/api/location')
    if (response.data.success && response.data.data) {
      const localAddresses = response.data.data
      localAddresses.forEach((addr: any) => {
        addr._isLocalAddress = true
      })
      addressOptions.value = localAddresses
    }
  } catch {
    // ignore
  }
}

function handleAddressChange(selAddressId: string) {
  if (selAddressId) {
    const addr = findAddressById(selAddressId)
    if (addr) {
      selectedAddress.value = addr
      searchForm.cityCode = parseInt(addr.cityCode)
      searchForm.latitude = addr.latitude
      searchForm.longitude = addr.longitude
      saveSelectedAddressId(selAddressId)
      handleSearch()
    }
  } else {
    selectedAddress.value = null
    searchForm.cityCode = null
    searchForm.latitude = ''
    searchForm.longitude = ''
    localStorage.removeItem('selectedAddressId')
  }
}

function handleDrawerAddressSelect(address: any) {
  selectedAddressId.value = address.id
  handleAddressChange(address.id)
  addressPopoverVisible.value = false
}

function handleAddressSearchInput(keyword: string) {
  if (addressSearchTimer) clearTimeout(addressSearchTimer)
  addressSearchTimer = setTimeout(() => {
    searchAddresses(keyword)
  }, 300)
}

async function loadDefaultAddress() {
  try {
    const response = await api.get('/api/location')
    if (response.data.success && response.data.data && response.data.data.length > 0) {
      addressOptions.value = response.data.data

      const savedId = getSavedAddressId()
      if (savedId) {
        const foundAddress = findAddressById(savedId)
        if (foundAddress) {
          selectedAddressId.value = savedId
          selectedAddress.value = foundAddress
          searchForm.cityCode = parseInt(foundAddress.cityCode)
          searchForm.latitude = foundAddress.latitude
          searchForm.longitude = foundAddress.longitude
          handleSearch()
          return
        } else {
          localStorage.removeItem('selectedAddressId')
        }
      }

      const firstAddress = addressOptions.value[0]
      selectedAddressId.value = firstAddress.id
      selectedAddress.value = firstAddress
      searchForm.cityCode = parseInt(firstAddress.cityCode)
      searchForm.latitude = firstAddress.latitude
      searchForm.longitude = firstAddress.longitude
      saveSelectedAddressId(firstAddress.id)
      handleSearch()
    } else {
      showCreateAddressPrompt()
    }
  } catch {
    ElMessage.error('获取地址列表失败')
    showCreateAddressPrompt()
  }
}

function showCreateAddressPrompt() {
  ElMessageBox.confirm('暂无地址信息，是否前往创建地址？', '提示', {
    confirmButtonText: '创建地址',
    cancelButtonText: '取消',
    type: 'info',
  })
    .then(() => {
      goToAddressPage()
    })
    .catch(() => {
      searchForm.cityCode = defaultCityCode
      handleSearch()
    })
}

function saveSelectedAddressId(addressId: string) {
  try {
    localStorage.setItem('selectedAddressId', addressId)
  } catch {
    // ignore
  }
}

function getAddressDisplayName(address: any) {
  return address.name || address.title || '未知地址'
}

function getSavedAddressId() {
  try {
    return localStorage.getItem('selectedAddressId')
  } catch {
    return null
  }
}

function findAddressById(addressId: string) {
  if (!addressId || !addressOptions.value.length) {
    return null
  }
  return addressOptions.value.find((addr: any) => addr.id === addressId)
}

function handleDialogClose() {
  notifyConfigVisible.value = false
  currentNotifyStore.value = null
  notifyConfigFormRef.value?.resetFields()
  notifyConfigForm.startHour = 8
  notifyConfigForm.endHour = 22
  notifyConfigForm.weeks = []
  notifyConfigForm.cron = ''
  notifyConfigCronCollapseActive.value = []
}

async function handleNotifyConfigSave() {
  try {
    await notifyConfigFormRef.value?.validate()
  } catch {
    return
  }

  if (!currentNotifyStore.value) {
    ElMessage.error('门店信息丢失，请重新操作')
    return
  }

  if (!selectedAddress.value || !selectedAddress.value.id) {
    ElMessage.error('请先选择地址')
    return
  }

  notifyConfigSaving.value = true

  try {
    const trimmedCron = notifyConfigForm.cron ? notifyConfigForm.cron.trim() : ''
    const configData: any = {
      type: 'STORE_ACTIVITY',
      locationId: selectedAddress.value.id,
      cron: trimmedCron || null,
      startHour: trimmedCron ? (notifyConfigForm.startHour ?? null) : notifyConfigForm.startHour,
      endHour: trimmedCron ? (notifyConfigForm.endHour ?? null) : notifyConfigForm.endHour,
      weeks: trimmedCron
        ? (notifyConfigForm.weeks.length > 0 ? notifyConfigForm.weeks.join(',') : null)
        : notifyConfigForm.weeks.join(','),
      storeExtNotifyConfig: {
        storeInfo: currentNotifyStore.value,
      },
    }
    const response = await api.post('/api/notify/config', configData)
    if (response.data.success) {
      ElMessage.success('监控配置保存成功!')
      handleDialogClose()
    } else {
      ElMessage.error(response.data.msg || '保存失败')
    }
  } catch {
    ElMessage.error('网络错误，请稍后重试')
  } finally {
    notifyConfigSaving.value = false
  }
}

function loadSavedAddress() {
  const savedId = getSavedAddressId()
  if (savedId) {
    // Address restore handled in loadDefaultAddress
  }
}

onMounted(async () => {
  // 等待认证完成
  await authState?.waitForAuth()
  getCurrentLocation()
  loadSavedAddress()
  loadDefaultAddress()
  initScrollObserver()
})

onBeforeUnmount(() => {
  if (scrollObserver) {
    scrollObserver.disconnect()
  }
})
</script>

<template>
  <div class="home-page">
    <!-- Sticky header search area -->
    <div class="header">
      <!-- Top bar: address + location icon -->
      <div class="header-top">
        <div class="address-trigger" @click="addressPopoverVisible = true">
          <svg class="loc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          <span class="address-text">{{ selectedAddress ? getAddressDisplayName(selectedAddress) : '选择地址' }}</span>
          <svg class="arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
        <div
          class="filter-toggle"
          :class="{ active: searchForm.onlyAvailable }"
          @click="searchForm.onlyAvailable = !searchForm.onlyAvailable; handleSearch()"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          <span>{{ searchForm.onlyAvailable ? '可抢' : '全部' }}</span>
        </div>
        <div
          class="filter-toggle"
          :class="{ active: searchForm.within3km }"
          @click="searchForm.within3km = !searchForm.within3km; handleSearch()"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
          </svg>
          <span>{{ searchForm.within3km ? '3km内' : '3km内' }}</span>
        </div>
      </div>

      <!-- Search input - capsule style -->
      <div class="search-bar">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          v-model="searchForm.name"
          class="search-input-native"
          type="search"
          placeholder="搜索门店名称"
          enterkeyhint="search"
          @keyup.enter="handleSearch()"
        />
        <div v-if="searchForm.name" class="search-clear" @click="searchForm.name = ''; handleSearch()">
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/>
          </svg>
        </div>
        <div class="search-btn" @click="handleSearch()">
          搜索
        </div>
      </div>

      <!-- Sort chips - horizontal scroll -->
      <div class="sort-chips">
        <div
          class="chip"
          :class="{ active: searchForm.orderType === 1 }"
          @click="handleSort(1)"
        >默认排序</div>
        <div
          class="chip"
          :class="{ active: searchForm.orderType === 2 }"
          @click="handleSort(2)"
        >返现金额</div>
        <div
          class="chip"
          :class="{ active: searchForm.orderType === 3 }"
          @click="handleSort(3)"
        >返现比例</div>
        <div
          class="chip"
          :class="{ active: searchForm.orderType === 4 }"
          @click="handleSort(4)"
        >距离排序</div>
      </div>
    </div>

    <!-- Address selection popover / drawer -->
    <teleport to="body">
      <transition name="drawer-fade">
        <div v-if="addressPopoverVisible" class="address-drawer-mask" @click.self="addressPopoverVisible = false">
          <transition name="drawer-slide">
            <div v-if="addressPopoverVisible" class="address-drawer">
              <div class="drawer-header">
                <span class="drawer-title">选择地址</span>
                <div class="drawer-close" @click="addressPopoverVisible = false">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </div>
              </div>
              <div class="drawer-search">
                <el-input
                  v-model="addressSearchKeyword"
                  placeholder="搜索地址关键词"
                  clearable
                  @input="handleAddressSearchInput"
                  prefix-icon="Search"
                />
              </div>
              <div class="drawer-list">
                <div v-if="addressLoading" class="drawer-loading">
                  <el-icon class="is-loading" :size="20"><i class="el-icon-loading" /></el-icon>
                  <span>搜索中...</span>
                </div>
                <div
                  v-else-if="addressOptions.length === 0"
                  class="drawer-empty"
                >暂无地址，请搜索或前往添加</div>
                <div
                  v-for="address in addressOptions"
                  :key="address.id"
                  class="drawer-addr-item"
                  :class="{ selected: selectedAddressId === address.id }"
                  @click="handleDrawerAddressSelect(address)"
                >
                  <div class="addr-name">{{ getAddressDisplayName(address) }}</div>
                  <div class="addr-detail">{{ address.address }}</div>
                  <svg v-if="selectedAddressId === address.id" class="addr-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="18" height="18">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
              </div>
              <div class="drawer-footer">
                <div class="drawer-add-btn" @click="goToAddressPage(); addressPopoverVisible = false">
                  + 管理地址
                </div>
              </div>
            </div>
          </transition>
        </div>
      </transition>
    </teleport>

    <!-- Content area -->
    <div class="content">
      <!-- Loading state -->
      <div v-if="loading" class="loading-container">
        <div class="loading-skeleton" v-for="n in 3" :key="n">
          <div class="skeleton-avatar"></div>
          <div class="skeleton-info">
            <div class="skeleton-line w60"></div>
            <div class="skeleton-line w40"></div>
            <div class="skeleton-line w80"></div>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-else-if="storeList.length === 0" class="empty-state">
        <div class="empty-illustration">
          <svg viewBox="0 0 120 120" fill="none" width="100" height="100">
            <circle cx="60" cy="60" r="50" fill="#f0f2f5"/>
            <rect x="35" y="45" width="50" height="35" rx="4" fill="#d9dce1"/>
            <rect x="40" y="38" width="40" height="8" rx="3" fill="#c4c7cc"/>
            <circle cx="50" cy="58" r="4" fill="#a0a3a8"/>
            <circle cx="70" cy="58" r="4" fill="#a0a3a8"/>
            <path d="M48 68 q12 8 24 0" stroke="#a0a3a8" stroke-width="2" fill="none"/>
          </svg>
        </div>
        <h3 class="empty-title">暂无门店信息</h3>
        <p class="empty-desc">试试切换地址或调整搜索条件</p>
      </div>

      <!-- Store list -->
      <div v-else class="store-list">
        <div
          v-for="store in storeList"
          :key="store.promotionId"
          class="store-card"
          :class="{ 'sold-out': store.leftNumber <= 0 }"
        >
          <!-- Card top: image + core info -->
          <div class="card-main">
            <div class="store-avatar">
              <img v-if="store.icon" :src="store.icon" :alt="store.name" />
              <span v-else class="avatar-letter">{{ store.name.charAt(0) }}</span>
            </div>
            <div class="store-body">
              <div class="store-name-row">
                <span class="store-name">{{ store.name }}</span>
                <span class="copy-btn" @click.stop="copyStoreName(store.name)" title="复制门店名称">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                </span>
                <span v-if="store.ifNew" class="badge badge-new">新店</span>
                <span :class="getPlatformClass(store.type)" class="badge">{{ getPlatformName(store.type) }}</span>
              </div>
              <div class="store-price-row">
                <span class="price-tag">
                  满<em>{{ store.price }}</em>返<em class="rebate">{{ store.rebatePrice }}</em>
                </span>
                <span class="distance-tag">{{ formatDistance(store.distance) }}</span>
              </div>
            </div>
          </div>

          <!-- Card detail chips -->
          <div class="card-tags">
            <span class="info-chip">{{ store.startTime }}-{{ store.endTime }}</span>
            <span class="info-chip">{{ getRebateConditionText(store.rebateCondition) }}</span>
            <span class="info-chip">{{ store.openHours }}</span>
            <span
              class="info-chip"
              :class="{ 'chip-danger': store.leftNumber <= 0, 'chip-success': store.leftNumber > 0 }"
            >
              {{ store.leftNumber > 0 ? '剩余 ' + store.leftNumber : '已售罄' }}
            </span>
          </div>

          <!-- Card action -->
          <div class="card-action" v-if="store.leftNumber <= 0">
            <div
              class="notify-btn"
              @click="handleBook(store)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              到货提醒
            </div>
          </div>
        </div>

        <!-- Notify config dialog -->
        <el-dialog
          title="门店监控配置"
          v-model="notifyConfigVisible"
          width="500px"
          class="monitor-dialog"
          :close-on-click-modal="false"
          :modal-append-to-body="true"
          :append-to-body="true"
          :before-close="handleDialogClose"
          style="margin-top: 5vh"
        >
          <div class="dialog-content">
            <div v-if="currentNotifyStore" class="store-preview">
              <div class="store-preview-icon">
                <img
                  v-if="currentNotifyStore.icon"
                  :src="currentNotifyStore.icon"
                  :alt="currentNotifyStore.name"
                />
                <span v-else>{{ currentNotifyStore.name.charAt(0) }}</span>
              </div>
              <div class="store-preview-info">
                <div class="store-preview-name">{{ currentNotifyStore.name }}</div>
                <div class="store-preview-detail">
                  满{{ currentNotifyStore.price }}返{{ currentNotifyStore.rebatePrice }}元
                </div>
              </div>
            </div>

            <el-form
              :model="notifyConfigForm"
              :rules="notifyConfigRules"
              ref="notifyConfigFormRef"
              label-width="110px"
              class="config-form"
            >
              <el-row :gutter="20">
                <el-col :span="12">
                  <el-form-item label="开始时间" prop="startHour">
                    <el-input-number
                      v-model="notifyConfigForm.startHour"
                      :min="0"
                      :max="23"
                      controls-position="right"
                      style="width: 100%"
                    />
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="结束时间" prop="endHour">
                    <el-input-number
                      v-model="notifyConfigForm.endHour"
                      :min="0"
                      :max="23"
                      controls-position="right"
                      style="width: 100%"
                    />
                  </el-form-item>
                </el-col>
              </el-row>

              <el-form-item label="运行星期" prop="weeks">
                <el-checkbox-group v-model="notifyConfigForm.weeks">
                  <el-checkbox
                    v-for="opt in weekOptions"
                    :key="opt.value"
                    :label="opt.value"
                    :value="opt.value"
                  >
                    {{ opt.label }}
                  </el-checkbox>
                </el-checkbox-group>
              </el-form-item>

              <el-form-item prop="cron">
                <el-collapse v-model="notifyConfigCronCollapseActive" style="width: 100%">
                  <el-collapse-item title="自定义 cron 表达式（高级）" name="cron">
                    <el-input
                      v-model="notifyConfigForm.cron"
                      placeholder="如：0 15 9 * * ?（6位，含秒）"
                      clearable
                      style="width: 100%"
                    />
                    <p class="cron-tip">填写后将完全按 cron 执行，无需设置开始/结束时间和运行星期。</p>
                  </el-collapse-item>
                </el-collapse>
              </el-form-item>
            </el-form>
          </div>

          <template #footer>
            <div class="dialog-footer">
              <el-button @click="handleDialogClose" class="cancel-btn">取消</el-button>
              <el-button
                type="primary"
                @click="handleNotifyConfigSave"
                :loading="notifyConfigSaving"
                class="confirm-btn"
              >
                {{ notifyConfigSaving ? '保存中...' : '确定配置' }}
              </el-button>
            </div>
          </template>
        </el-dialog>

        <!-- Scroll load more indicator -->
        <div class="scroll-loading-container" v-if="storeList.length > 0">
          <div v-if="pagination.isLoadingMore" class="loading-more">
            <div class="loading-dots">
              <span></span><span></span><span></span>
            </div>
            <span>加载中</span>
          </div>

          <div v-else-if="!pagination.hasNextPage" class="no-more-data">
            <span class="divider-line"></span>
            <span>没有更多了</span>
            <span class="divider-line"></span>
          </div>

          <div v-else class="load-more-trigger" ref="loadMoreTrigger">
            &nbsp;
          </div>

          <div class="pagination-info">共 {{ storeList.length }} 条</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// ============================================
// Variables
// ============================================
$primary: #4f6ef7;
$primary-light: #eef2ff;
$success: #22c55e;
$danger: #ef4444;
$text-primary: #1a1a2e;
$text-secondary: #6b7280;
$text-hint: #9ca3af;
$bg: #f5f6fa;
$card-bg: #ffffff;
$border: #e5e7eb;
$radius-sm: 8px;
$radius-md: 12px;
$radius-lg: 16px;
$radius-full: 999px;

// ============================================
// Page layout
// ============================================
.home-page {
  padding-bottom: 20px;
  padding-bottom: calc(20px + env(safe-area-inset-bottom));
  overflow-x: hidden;
  max-width: 100%;
}

// ============================================
// Sticky Header
// ============================================
.header {
  position: sticky;
  top: -1px;
  z-index: 100;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-radius: $radius-lg;
  padding: 12px 16px;
  margin-bottom: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  transition: box-shadow 0.3s;
}

// ============================================
// Header top bar
// ============================================
.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.address-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-radius: $radius-full;
  background: $primary-light;
  color: $primary;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  max-width: 70%;
  transition: background 0.2s;
  -webkit-tap-highlight-color: transparent;

  &:active {
    background: #e2e6f9;
  }
}

.loc-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: $primary;
}

.address-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.arrow-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  opacity: 0.6;
}

.filter-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: $radius-full;
  font-size: 13px;
  color: $text-secondary;
  background: #f3f4f6;
  cursor: pointer;
  transition: all 0.2s;
  -webkit-tap-highlight-color: transparent;

  &.active {
    background: $primary;
    color: #fff;
  }

  &:active {
    transform: scale(0.96);
  }
}

// ============================================
// Search bar (capsule style)
// ============================================
.search-bar {
  display: flex;
  align-items: center;
  background: #f3f4f6;
  border-radius: $radius-full;
  padding: 0 4px 0 14px;
  height: 42px;
  margin-bottom: 10px;
  transition: box-shadow 0.2s;

  &:focus-within {
    box-shadow: 0 0 0 2px rgba($primary, 0.25);
    background: #fff;
  }
}

.search-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: $text-hint;
}

.search-input-native {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 15px;
  padding: 0 8px;
  color: $text-primary;
  min-width: 0;

  &::placeholder {
    color: $text-hint;
  }

  &::-webkit-search-cancel-button,
  &::-webkit-search-decoration {
    -webkit-appearance: none;
  }
}

.search-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: $text-hint;
  cursor: pointer;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}

.search-btn {
  flex-shrink: 0;
  background: $primary;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  padding: 0 16px;
  height: 34px;
  line-height: 34px;
  border-radius: $radius-full;
  cursor: pointer;
  transition: background 0.2s;
  -webkit-tap-highlight-color: transparent;

  &:active {
    background: #3d5bd4;
  }
}

// ============================================
// Sort chips
// ============================================
.sort-chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  -ms-overflow-style: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.chip {
  flex-shrink: 0;
  padding: 5px 14px;
  border-radius: $radius-full;
  font-size: 13px;
  color: $text-secondary;
  background: #f3f4f6;
  cursor: pointer;
  transition: all 0.2s;
  -webkit-tap-highlight-color: transparent;
  white-space: nowrap;

  &.active {
    background: $primary;
    color: #fff;
    font-weight: 500;
  }

  &:active {
    transform: scale(0.96);
  }
}

// ============================================
// Address Drawer
// ============================================
.address-drawer-mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.45);
}

.address-drawer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  border-radius: $radius-lg $radius-lg 0 0;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid $border;
}

.drawer-title {
  font-size: 16px;
  font-weight: 600;
  color: $text-primary;
}

.drawer-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #f3f4f6;
  cursor: pointer;
  color: $text-secondary;
}

.drawer-search {
  padding: 12px 16px;
}

.drawer-list {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0 16px;
}

.drawer-loading,
.drawer-empty {
  text-align: center;
  padding: 30px 0;
  color: $text-hint;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.drawer-addr-item {
  position: relative;
  padding: 14px 36px 14px 0;
  border-bottom: 1px solid #f3f4f6;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &:active {
    background: #f9fafb;
  }

  &.selected {
    .addr-name {
      color: $primary;
      font-weight: 600;
    }
  }
}

.addr-name {
  font-size: 15px;
  color: $text-primary;
  font-weight: 500;
  margin-bottom: 4px;
}

.addr-detail {
  font-size: 12px;
  color: $text-hint;
  line-height: 1.4;
}

.addr-check {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  color: $primary;
}

.drawer-footer {
  padding: 12px 16px;
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
  border-top: 1px solid $border;
}

.drawer-add-btn {
  text-align: center;
  color: $primary;
  font-size: 15px;
  font-weight: 500;
  padding: 10px;
  cursor: pointer;
  border-radius: $radius-md;
  background: $primary-light;

  &:active {
    background: #e2e6f9;
  }
}

// Drawer transitions
.drawer-fade-enter-active,
.drawer-fade-leave-active {
  transition: opacity 0.3s ease;
}
.drawer-fade-enter-from,
.drawer-fade-leave-to {
  opacity: 0;
}

.drawer-slide-enter-active {
  transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
}
.drawer-slide-leave-active {
  transition: transform 0.25s cubic-bezier(0.32, 0.72, 0, 1);
}
.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateY(100%);
}

// ============================================
// Content area
// ============================================
.content {
  min-height: 50vh;
  overflow-x: hidden;
  max-width: 100%;
}

// ============================================
// Loading skeleton
// ============================================
.loading-container {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.loading-skeleton {
  display: flex;
  gap: 12px;
  padding: 16px;
  background: $card-bg;
  border-radius: $radius-md;
}

.skeleton-avatar {
  width: 64px;
  height: 64px;
  border-radius: $radius-sm;
  background: linear-gradient(110deg, #f0f0f0 8%, #e0e0e0 18%, #f0f0f0 33%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  flex-shrink: 0;
}

.skeleton-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton-line {
  height: 14px;
  border-radius: 7px;
  background: linear-gradient(110deg, #f0f0f0 8%, #e0e0e0 18%, #f0f0f0 33%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;

  &.w60 { width: 60%; }
  &.w40 { width: 40%; }
  &.w80 { width: 80%; }
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

// ============================================
// Empty state
// ============================================
.empty-state {
  text-align: center;
  padding: 60px 20px;
}

.empty-illustration {
  margin-bottom: 16px;
}

.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: $text-primary;
  margin-bottom: 6px;
}

.empty-desc {
  font-size: 14px;
  color: $text-hint;
}

// ============================================
// Store card
// ============================================
.store-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.store-card {
  background: $card-bg;
  border-radius: $radius-md;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: box-shadow 0.2s;
  overflow: hidden;
  max-width: 100%;

  &.sold-out {
    .card-main {
      opacity: 0.55;
    }
    .card-tags .info-chip:not(.chip-danger) {
      opacity: 0.55;
    }
  }
}

.card-main {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.store-avatar {
  width: 64px;
  height: 64px;
  border-radius: $radius-sm;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-letter {
    color: #fff;
    font-size: 20px;
    font-weight: 600;
  }
}

.store-body {
  flex: 1;
  min-width: 0;
}

.store-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}

.store-name {
  font-size: 15px;
  font-weight: 600;
  color: $text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 55%;
}

.copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  color: $text-hint;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s;
  -webkit-tap-highlight-color: transparent;

  &:hover {
    color: $primary;
    background: $primary-light;
  }

  &:active {
    transform: scale(0.9);
  }
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: $radius-full;
  font-size: 11px;
  font-weight: 500;
  flex-shrink: 0;
}

.badge-new {
  background: linear-gradient(135deg, #ff6b6b, #ff8e53);
  color: #fff;
}

.platform-tag {
  &.platform-meituan {
    background: #fff3cd;
    color: #856404;
  }
  &.platform-eleme {
    background: #cce5ff;
    color: #004085;
  }
  &.platform-jd {
    background: #f8d7da;
    color: #721c24;
  }
}

.store-price-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.price-tag {
  font-size: 13px;
  color: $text-secondary;

  em {
    font-style: normal;
    font-weight: 600;
    color: $text-primary;
  }

  .rebate {
    color: #ef4444;
    font-size: 18px;
    font-weight: 700;
  }
}

.distance-tag {
  font-size: 12px;
  color: $text-hint;
  flex-shrink: 0;
}

// ============================================
// Card tags
// ============================================
.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #f3f4f6;
  overflow: hidden;
  max-width: 100%;
}

.info-chip {
  font-size: 12px;
  padding: 3px 8px;
  border-radius: $radius-full;
  background: #f3f4f6;
  color: $text-secondary;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;

  &.chip-success {
    background: #dcfce7;
    color: #166534;
    font-weight: 500;
  }

  &.chip-danger {
    background: #fee2e2;
    color: #991b1b;
    font-weight: 500;
  }
}

// ============================================
// Card action
// ============================================
.card-action {
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
}

.notify-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border-radius: $radius-full;
  background: $primary;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
  -webkit-tap-highlight-color: transparent;

  &:active {
    background: #3d5bd4;
  }
}

// ============================================
// Monitor dialog (styles in non-scoped block below due to append-to-body)
// ============================================

.store-preview {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  border-radius: 6px;
  margin-bottom: 12px;
  border: 1px solid #e3e6ea;

  &-icon {
    width: 40px;
    height: 40px;
    border-radius: 6px;
    background: linear-gradient(45deg, #667eea, #764ba2);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 14px;
    font-weight: bold;
    flex-shrink: 0;

    img {
      width: 100%;
      height: 100%;
      border-radius: 6px;
      object-fit: cover;
    }
  }

  &-info {
    flex: 1;
  }

  &-name {
    font-size: 15px;
    font-weight: 600;
    color: #2c3e50;
    margin-bottom: 3px;
  }

  &-detail {
    font-size: 13px;
    color: #666;
  }
}



// ============================================
// Dialog footer
// ============================================
.dialog-footer {
  display: flex;
  justify-content: center;
  gap: 12px;
}

.cancel-btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: 500;
}

.confirm-btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: 600;
}

// ============================================
// Scroll loading
// ============================================
.scroll-loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-top: 20px;
  padding: 16px 0;
}

.loading-more {
  display: flex;
  align-items: center;
  gap: 8px;
  color: $text-hint;
  font-size: 13px;
}

.loading-dots {
  display: flex;
  gap: 4px;

  span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: $primary;
    animation: dot-bounce 1.4s infinite ease-in-out both;

    &:nth-child(1) { animation-delay: -0.32s; }
    &:nth-child(2) { animation-delay: -0.16s; }
  }
}

@keyframes dot-bounce {
  0%, 80%, 100% { transform: scale(0); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}

.no-more-data {
  display: flex;
  align-items: center;
  gap: 12px;
  color: $text-hint;
  font-size: 12px;
}

.divider-line {
  display: inline-block;
  width: 40px;
  height: 1px;
  background: $border;
}

.load-more-trigger {
  min-height: 1px;
  width: 100%;
}

.pagination-info {
  color: $text-hint;
  font-size: 12px;
}

.cron-tip {
  font-size: 12px;
  color: #999;
  margin-top: 8px;
  line-height: 1.5;
}

// ============================================
// Responsive: larger screens
// ============================================
@media screen and (min-width: 769px) {
  .header {
    border-radius: $radius-lg;
    margin: 0 0 16px;
    padding: 16px 20px;
  }

  .search-bar {
    max-width: 500px;
  }

  .store-list {
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }

  .loading-container {
    grid-template-columns: repeat(2, 1fr);
  }

  .store-card {
    padding: 18px;

    &:hover {
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
    }
  }

  .address-drawer {
    max-width: 420px;
    left: 50%;
    transform: translateX(-50%);
    border-radius: $radius-lg $radius-lg 0 0;
  }

  .drawer-slide-enter-from,
  .drawer-slide-leave-to {
    transform: translateX(-50%) translateY(100%);
  }
}

@media screen and (min-width: 1200px) {
  .store-list {
    grid-template-columns: repeat(3, 1fr);
  }

  .loading-container {
    grid-template-columns: repeat(3, 1fr);
  }
}

// ============================================
// Responsive: mobile
// ============================================
@media screen and (max-width: 768px) {
  .header {
    margin-bottom: 10px;
    padding: 10px 12px;
  }

  .config-form {
    :deep(.el-form-item__label) {
      font-size: 13px;
    }
  }
}
</style>

<style lang="scss">
// Non-scoped styles for el-dialog
// append-to-body teleports dialog outside component DOM, breaking scoped styles
.monitor-dialog.el-dialog {
  max-width: calc(100vw - 32px);
  box-sizing: border-box;

  @media screen and (max-width: 768px) {
    width: 92% !important;
    margin: 16px auto !important;

    .el-dialog__body {
      padding: 16px 12px;
      max-height: 65vh;
      overflow-y: auto;
    }

    .el-form {
      .el-form-item__label {
        font-size: 14px;
      }

      .el-form-item {
        margin-bottom: 20px;
      }

      .el-input-number {
        .el-input__inner {
          font-size: 15px;
        }
      }

      .el-checkbox-group {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 4px;

        .el-checkbox {
          margin-right: 0;
          padding: 6px 10px;
          border: 1px solid #dcdfe6;
          border-radius: 6px;

          &.is-checked {
            border-color: #409eff;
            background-color: #ecf5ff;
          }
        }
      }

      .el-row {
        .el-col {
          max-width: 100%;
          flex: 0 0 100%;

          &:first-child {
            margin-bottom: 4px;
          }
        }
      }
    }
  }
}
</style>
