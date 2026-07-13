<script setup lang="ts">
import { ref, reactive, computed, onMounted, inject } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance } from 'element-plus'
import api from '../api'

const authState = inject<{
  isAuthenticated: { value: boolean }
  setAuthenticated: () => void
  waitForAuth: () => Promise<void>
}>('authState')!

const configList = ref<any[]>([])
const locationList = ref<any[]>([])
const loginStateList = ref<any[]>([])
const loading = ref(false)

const loginStateMap = computed(() => {
  const m: Record<number, string> = {}
  for (const s of loginStateList.value) m[s.id] = s.name
  return m
})

// 对话框
const dialogVisible = ref(false)
const isEdit = ref(false)
const editingId = ref<number | null>(null)
const submitLoading = ref(false)
const formRef = ref<FormInstance>()

const form = reactive({
  loginStateId: null as number | null,
  locationId: null as number | null,
  promotionId: null as number | null,
  silkId: 0 as number | null,
  cron: '',
  executeAt: '' as string,
  leadMs: 0,
  enableRetry: true,
  maxRetry: 3,
  retryIntervalMs: 500,
})

const formRules = {
  loginStateId: [{ required: true, message: '请选择登录态', trigger: 'change' }],
  locationId: [{ required: true, message: '请选择位置', trigger: 'change' }],
  promotionId: [{ required: true, message: '请填写活动 promotion_id', trigger: 'blur' }],
}

// 活动选择（从当日活动列表带入 promotion_id）
const storeDialogVisible = ref(false)
const storeLoading = ref(false)
const storeList = ref<any[]>([])
const storeQuery = reactive({
  cityCode: null as number | null,
  latitude: '',
  longitude: '',
  onlyAvailable: true,
  pageNum: 1,
  pageSize: 20,
})

function resetForm() {
  Object.assign(form, {
    loginStateId: null,
    locationId: null,
    promotionId: null,
    silkId: 0,
    cron: '',
    executeAt: '',
    leadMs: 0,
    enableRetry: true,
    maxRetry: 3,
    retryIntervalMs: 500,
  })
}

async function loadConfigs() {
  loading.value = true
  try {
    const res = await api.get('/api/grab/config/list')
    configList.value = res.data.data || []
  } finally {
    loading.value = false
  }
}

async function loadLocations() {
  try {
    const res = await api.get('/api/location')
    locationList.value = res.data.data || []
  } catch {
    /* ignore */
  }
}

async function loadLoginStates() {
  try {
    const res = await api.get('/api/grab/login-state/list')
    loginStateList.value = res.data.data || []
  } catch {
    /* ignore */
  }
}

function openAdd() {
  isEdit.value = false
  editingId.value = null
  resetForm()
  if (loginStateList.value.length > 0) {
    form.loginStateId = loginStateList.value[0].id
  }
  if (locationList.value.length > 0) {
    form.locationId = locationList.value[0].id
  }
  dialogVisible.value = true
}

function openEdit(row: any) {
  isEdit.value = true
  editingId.value = row.id
  Object.assign(form, {
    loginStateId: row.loginStateId,
    locationId: row.locationId,
    promotionId: row.promotionId,
    silkId: row.silkId ?? 0,
    cron: row.cron || '',
    executeAt: row.executeAt ? row.executeAt.replace(' ', 'T').slice(0, 19) : '',
    leadMs: row.leadMs ?? 0,
    enableRetry: row.enableRetry ?? true,
    maxRetry: row.maxRetry ?? 3,
    retryIntervalMs: row.retryIntervalMs ?? 500,
  })
  dialogVisible.value = true
}

async function handleSubmit() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  submitLoading.value = true
  const payload: any = {
    loginStateId: form.loginStateId,
    locationId: form.locationId,
    promotionId: form.promotionId,
    silkId: form.silkId,
    cron: form.cron?.trim() || null,
    executeAt: form.executeAt ? form.executeAt.replace('T', ' ') : null,
    leadMs: form.leadMs,
    enableRetry: form.enableRetry,
    maxRetry: form.maxRetry,
    retryIntervalMs: form.retryIntervalMs,
  }
  if (isEdit.value) payload.id = editingId.value
  try {
    await api.post('/api/grab/config', payload)
    ElMessage.success(isEdit.value ? '已更新' : '已创建')
    dialogVisible.value = false
    await loadConfigs()
  } finally {
    submitLoading.value = false
  }
}

async function handleDelete(row: any) {
  try {
    await ElMessageBox.confirm('确定删除该抢单配置？', '提示', { type: 'warning' })
  } catch {
    return
  }
  await api.delete(`/api/grab/config/${row.id}`)
  ElMessage.success('已删除')
  await loadConfigs()
}

async function handleToggle(row: any) {
  const target = row.status === 'ENABLE' ? 'DISABLE' : 'ENABLE'
  await api.put(`/api/grab/config/${row.id}/status`, null, { params: { status: target } })
  ElMessage.success(target === 'ENABLE' ? '已启用' : '已停用')
  await loadConfigs()
}

const grabLoading = ref<Record<number, boolean>>({})
async function handleGrab(row: any) {
  try {
    await ElMessageBox.confirm(
      '将立即抢一次（真实抢券，可能消耗名额/产生订单）。继续？',
      '手动抢单',
      { type: 'warning' },
    )
  } catch {
    return
  }
  grabLoading.value[row.id] = true
  try {
    const res = await api.post(`/api/grab/config/${row.id}/execute`)
    const d = res.data.data
    if (d && d.success) {
      ElMessageBox.alert(`抢单成功！订单号 ${d.promotionOrderId}`, '抢到了', { type: 'success' })
    } else {
      ElMessage.warning(`未抢到：${d?.msg || ''} (code=${d?.code})`)
    }
    await loadConfigs()
  } finally {
    grabLoading.value[row.id] = false
  }
}

// 活动选择
function openStorePicker() {
  // 用所选位置的 cityCode/经纬度
  const loc = locationList.value.find((l) => l.id === form.locationId)
  if (loc) {
    storeQuery.cityCode = loc.cityCode
    storeQuery.latitude = loc.latitude
    storeQuery.longitude = loc.longitude
  }
  storeDialogVisible.value = true
  loadStores()
}

async function loadStores() {
  if (!storeQuery.cityCode || !storeQuery.latitude) {
    ElMessage.warning('请先选择位置')
    return
  }
  storeLoading.value = true
  try {
    const res = await api.post('/api/xiaochan/query', {
      cityCode: storeQuery.cityCode,
      latitude: storeQuery.latitude,
      longitude: storeQuery.longitude,
      onlyAvailable: storeQuery.onlyAvailable,
      pageNum: storeQuery.pageNum,
      pageSize: storeQuery.pageSize,
    })
    storeList.value = res.data.data || []
  } finally {
    storeLoading.value = false
  }
}

function pickStore(row: any, setScheduled: boolean = false) {
  form.promotionId = row.promotionId
  // silk_id 通常与用户相关，抓包录入的登录态对应；这里不自动填，保留用户手填或 0
  let tip = `已选活动 ${row.promotionId}（${row.name}）`
  if (setScheduled && row.startTime) {
    // 把开抢时间配上当天日期，填入一次性执行时间（命中后自动停用）
    const today = new Date()
    const [hh, mm] = row.startTime.split(':')
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate(),
      Number(hh) || 0, Number(mm) || 0, 0)
    const pad = (n: number) => String(n).padStart(2, '0')
    form.executeAt = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
    form.cron = ''
    tip += `，并设为 ${row.startTime} 一次性开抢`
  }
  storeDialogVisible.value = false
  ElMessage.success(tip)
}

function timeRange(row: any): string {
  if (!row.startTime && !row.endTime) return ''
  return `${row.startTime || ''}-${row.endTime || ''}`
}

function isAllDay(row: any): boolean {
  if (!row.startTime || !row.endTime) return true
  // 起始 ≤ 00:00 且结束 ≥ 23:59（含 00:00-23:59 / 00:00-24:00 / 带秒精度等）视为全天
  const toMin = (t: string): number => {
    const p = String(t).split(':')
    return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0)
  }
  return toMin(row.startTime) <= 0 && toMin(row.endTime) >= 23 * 60 + 59
}

function platformName(type: number) {
  return { 1: '美团', 2: '饿了么', 3: '京东' }[type] || type
}

onMounted(async () => {
  await authState?.waitForAuth?.()
  await Promise.all([loadConfigs(), loadLocations(), loadLoginStates()])
})
</script>

<template>
  <div class="grab-config-view">
    <div class="page-card">
      <div class="header-row">
        <h2 class="page-title">抢单配置</h2>
        <el-button type="primary" @click="openAdd">新建抢单</el-button>
      </div>

      <el-table :data="configList" v-loading="loading" style="width: 100%" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="登录态" width="120">
          <template #default="{ row }">
            {{ loginStateMap[row.loginStateId] || `#${row.loginStateId}` || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="promotionId" label="活动ID" width="110" />
        <el-table-column prop="silkId" label="silk_id" width="110" />
        <el-table-column label="定时" width="180">
          <template #default="{ row }">
            <div v-if="row.cron">cron: {{ row.cron }}</div>
            <div v-else-if="row.executeAt">{{ row.executeAt }} (一次性)</div>
            <span v-else class="muted">仅手动</span>
          </template>
        </el-table-column>
        <el-table-column label="重试" width="120">
          <template #default="{ row }">
            <span v-if="row.enableRetry">{{ row.maxRetry }}次/{{ row.retryIntervalMs }}ms</span>
            <span v-else class="muted">关</span>
          </template>
        </el-table-column>
        <el-table-column prop="lastResult" label="最近结果" show-overflow-tooltip />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'ENABLE' ? 'success' : 'info'">
              {{ row.status === 'ENABLE' ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" :loading="grabLoading[row.id]"
              @click="handleGrab(row)">抢一次</el-button>
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" @click="handleToggle(row)">
              {{ row.status === 'ENABLE' ? '停用' : '启用' }}
            </el-button>
            <el-button size="small" type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 配置对话框 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑抢单' : '新建抢单'" width="560px" align-center>
      <el-form :model="form" :rules="formRules" ref="formRef" label-width="110px">
        <el-form-item label="登录态" prop="loginStateId">
          <el-select v-model="form.loginStateId" placeholder="选择抢单账号" style="width: 100%">
            <el-option v-for="s in loginStateList" :key="s.id"
              :label="`${s.name}（用户${s.xcUserId}${s.expireStatus === '已过期' ? '/已过期' : ''}）`" :value="s.id" />
          </el-select>
          <div class="hint" v-if="loginStateList.length === 0">未录入登录态，请先到「抢单登录态」页面新增</div>
        </el-form-item>
        <el-form-item label="位置" prop="locationId">
          <el-select v-model="form.locationId" placeholder="选择位置" style="width: 100%">
            <el-option v-for="l in locationList" :key="l.id" :label="`${l.name}(${l.address})`" :value="l.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="活动ID" prop="promotionId">
          <div style="display:flex;gap:8px;width:100%">
            <el-input-number v-model="form.promotionId" :controls="false" style="flex:1" placeholder="promotion_id" />
            <el-button @click="openStorePicker">从活动列表选</el-button>
          </div>
        </el-form-item>
        <el-form-item label="silk_id">
          <el-input-number v-model="form.silkId" :min="0" :controls="false" style="width: 100%" />
          <div class="hint">抢单实际使用登录态的 silk_id，此字段保留兼容可留 0</div>
        </el-form-item>
        <el-form-item label="cron 表达式">
          <el-input v-model="form.cron" placeholder="6位含秒，如 0 0 10 * * ?；留空则不用定时" />
        </el-form-item>
        <el-form-item label="一次性执行时间">
          <el-date-picker v-model="form.executeAt" type="datetime" placeholder="精确到秒，命中后自动停用"
            value-format="YYYY-MM-DDTHH:mm:ss" style="width: 100%" />
        </el-form-item>
        <el-form-item label="提前量(ms)">
          <el-input-number v-model="form.leadMs" :min="0" :step="100" />
        </el-form-item>
        <el-form-item label="失败重试">
          <el-switch v-model="form.enableRetry" />
          <span class="hint">仅 code=4(未开始) 时重试</span>
        </el-form-item>
        <template v-if="form.enableRetry">
          <el-form-item label="最大重试次数">
            <el-input-number v-model="form.maxRetry" :min="1" :max="50" />
          </el-form-item>
          <el-form-item label="重试间隔(ms)">
            <el-input-number v-model="form.retryIntervalMs" :min="100" :step="100" />
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 活动选择对话框 -->
    <el-dialog v-model="storeDialogVisible" title="选择要抢的活动" width="780px" align-center>
      <div class="store-toolbar">
        <el-checkbox v-model="storeQuery.onlyAvailable" @change="loadStores">仅看可抢</el-checkbox>
        <el-button size="small" @click="loadStores">刷新</el-button>
      </div>
      <el-table :data="storeList" v-loading="storeLoading" max-height="420" size="small">
        <el-table-column prop="name" label="店铺" min-width="160" show-overflow-tooltip />
        <el-table-column label="平台" width="80">
          <template #default="{ row }">{{ platformName(row.type) }}</template>
        </el-table-column>
        <el-table-column prop="promotionId" label="活动ID" width="110" />
        <el-table-column label="满/返" width="120">
          <template #default="{ row }">{{ row.price }} / {{ row.rebatePrice }}</template>
        </el-table-column>
        <el-table-column label="可抢时段" width="120">
          <template #default="{ row }">
            <el-tag v-if="isAllDay(row)" type="info" size="small">全天</el-tag>
            <el-tag v-else type="warning" size="small">{{ timeRange(row) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="leftNumber" label="库存" width="70" />
        <el-table-column prop="distance" label="距离" width="80">
          <template #default="{ row }">{{ row.distance }}m</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="pickStore(row)">选择</el-button>
            <el-button v-if="!isAllDay(row)" size="small" @click="pickStore(row, true)">设为定时</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<style scoped>
.grab-config-view {
  max-width: 1100px;
  margin: 0 auto;
}
.page-card {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.page-title {
  margin: 0;
  color: #2c3e50;
}
.muted {
  color: #c0c4cc;
}
.hint {
  margin-left: 10px;
  color: #909399;
  font-size: 13px;
}
.store-toolbar {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 12px;
}
</style>
