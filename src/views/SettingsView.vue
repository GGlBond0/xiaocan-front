<script setup lang="ts">
import { ref, reactive, onMounted, inject } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance } from 'element-plus'
import api from '../api'

// 注入认证状态
const authState = inject<{
  isAuthenticated: { value: boolean }
  setAuthenticated: () => void
  waitForAuth: () => Promise<void>
}>('authState')!

const loading = ref(false)
const saving = ref(false)
const formRef = ref<FormInstance>()

const form = reactive({
  enabled: false,
  apiUrl: '',
  ttl: 28,
  retry: 3,
  requestTimeout: 5000,
})

// 商家黑名单表单
const blacklistLoading = ref(false)
const blacklistSaving = ref(false)
const blacklistFormRef = ref<FormInstance>()
const blacklistForm = reactive({
  enabled: false,
  keywords: '',
})
const blacklistFormRules = {
  keywords: [
    {
      validator: (_rule: any, value: string, callback: any) => {
        if (value && value.length > 4000) {
          callback(new Error('关键字规则总长度不能超过 4000 字符'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
}

const formRules = {
  apiUrl: [
    {
      validator: (_rule: any, value: string, callback: any) => {
        if (form.enabled && (!value || !value.trim())) {
          callback(new Error('启用代理时 API 地址必填'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
  ttl: [{ type: 'number', min: 1, message: '缓存有效期需 ≥ 1', trigger: 'blur' }],
  retry: [{ type: 'number', min: 1, message: '重试次数需 ≥ 1', trigger: 'blur' }],
  requestTimeout: [{ type: 'number', min: 1000, message: '请求超时需 ≥ 1000', trigger: 'blur' }],
}

async function loadConfig() {
  loading.value = true
  try {
    const response = await api.get('/api/proxy/config')
    if (response.data.success && response.data.data) {
      const d = response.data.data
      form.enabled = !!d.enabled
      form.apiUrl = d.apiUrl || ''
      form.ttl = d.ttl ?? 28
      form.retry = d.retry ?? 3
      form.requestTimeout = d.requestTimeout ?? 5000
    }
  } catch {
    // 拦截器已弹错
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    const response = await api.put('/api/proxy/config', {
      enabled: form.enabled,
      apiUrl: form.apiUrl,
      ttl: form.ttl,
      retry: form.retry,
      requestTimeout: form.requestTimeout,
    })
    if (response.data.success) {
      ElMessage.success('保存成功，配置已即时生效')
      await loadConfig()
    }
  } catch {
    // 拦截器已弹错
  } finally {
    saving.value = false
  }
}

async function loadBlacklist() {
  blacklistLoading.value = true
  try {
    const response = await api.get('/api/blacklist/config')
    if (response.data.success && response.data.data) {
      const d = response.data.data
      blacklistForm.enabled = !!d.enabled
      blacklistForm.keywords = d.keywords || ''
    }
  } catch {
    // 拦截器已弹错
  } finally {
    blacklistLoading.value = false
  }
}

async function handleSaveBlacklist() {
  try {
    await blacklistFormRef.value?.validate()
  } catch {
    return
  }
  blacklistSaving.value = true
  try {
    const response = await api.put('/api/blacklist/config', {
      enabled: blacklistForm.enabled,
      keywords: blacklistForm.keywords,
    })
    if (response.data.success) {
      ElMessage.success('保存成功，配置已即时生效')
      await loadBlacklist()
    }
  } catch {
    // 拦截器已弹错
  } finally {
    blacklistSaving.value = false
  }
}

// ===== 霸王餐刷任务（App / Android 登录态） =====
const lotteryLoading = ref(false)
const lotteryAuthList = ref<any[]>([])
// 录入弹窗
const authDialogVisible = ref(false)
const authSaving = ref(false)
const authForm = reactive({ name: '', rawHeaders: '' })
const authEditingId = ref<number | null>(null)
// 刷任务
const runLoading = ref<number | null>(null)
const runResult = ref<any>(null)

async function loadLotteryAuth() {
  lotteryLoading.value = true
  try {
    const response = await api.get('/api/lottery/auth/list')
    if (response.data.success) {
      lotteryAuthList.value = response.data.data || []
    }
  } catch {
    // 拦截器已弹错
  } finally {
    lotteryLoading.value = false
  }
}

function openAddAuth() {
  authEditingId.value = null
  authForm.name = ''
  authForm.rawHeaders = ''
  authDialogVisible.value = true
}

async function handleSaveAuth() {
  if (!authForm.rawHeaders.trim()) {
    ElMessage.warning('请粘贴抓包 header（需含 X-Session-Id 与 x-Teemo 或 body.silk_id）')
    return
  }
  authSaving.value = true
  try {
    const config = authEditingId.value != null ? { params: { id: authEditingId.value } } : undefined
    const response = await api.post('/api/lottery/auth', { name: authForm.name, rawHeaders: authForm.rawHeaders }, config)
    if (response.data.success) {
      ElMessage.success('登录态已保存')
      authDialogVisible.value = false
      await loadLotteryAuth()
    }
  } catch {
    // 拦截器已弹错
  } finally {
    authSaving.value = false
  }
}

async function handleDeleteAuth(id: number) {
  try {
    await ElMessageBox.confirm('确认删除该登录态？', '提示', { type: 'warning' })
  } catch {
    return
  }
  try {
    const response = await api.delete(`/api/lottery/auth/${id}`)
    if (response.data.success) {
      ElMessage.success('已删除')
      await loadLotteryAuth()
    }
  } catch {
    // 拦截器已弹错
  }
}

async function handleRun(authId: number) {
  runLoading.value = authId
  runResult.value = null
  try {
    const response = await api.post('/api/lottery/run', undefined, { params: { authId } })
    if (response.data.success) {
      runResult.value = response.data.data
    }
  } catch {
    // 拦截器已弹错
  } finally {
    runLoading.value = null
  }
}

onMounted(async () => {
  await authState?.waitForAuth()
  await Promise.all([loadConfig(), loadBlacklist(), loadLotteryAuth()])
})
</script>

<template>
  <div class="settings-page" v-loading="loading">
    <div class="settings-header">
      <h2 class="settings-title">代理设置</h2>
      <p class="settings-desc">代理 IP 池全局配置，保存后即时生效，无需重启服务</p>
    </div>

    <div class="settings-card">
      <el-form
        :model="form"
        :rules="formRules"
        ref="formRef"
        label-width="140px"
        class="config-form"
      >
        <el-form-item label="启用代理" prop="enabled">
          <el-switch v-model="form.enabled" />
          <span class="form-hint">关闭后所有上游请求直连</span>
        </el-form-item>

        <el-form-item label="代理 API 地址" prop="apiUrl">
          <el-input
            v-model="form.apiUrl"
            placeholder="拉取代理 IP 的上游 API 地址"
            clearable
          />
        </el-form-item>

        <el-form-item label="缓存有效期(秒)" prop="ttl">
          <el-input-number v-model="form.ttl" :min="1" :max="86400" controls-position="right" />
        </el-form-item>

        <el-form-item label="失败重试次数" prop="retry">
          <el-input-number v-model="form.retry" :min="1" :max="20" controls-position="right" />
        </el-form-item>

        <el-form-item label="请求超时(毫秒)" prop="requestTimeout">
          <el-input-number v-model="form.requestTimeout" :min="1000" :max="60000" :step="1000" controls-position="right" />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
          <el-button @click="loadConfig">重新读取</el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- 商家黑名单 -->
    <div class="settings-card" v-loading="blacklistLoading">
      <el-form
        :model="blacklistForm"
        :rules="blacklistFormRules"
        ref="blacklistFormRef"
        label-width="140px"
        class="config-form"
      >
        <el-form-item label="启用黑名单" prop="enabled">
          <el-switch v-model="blacklistForm.enabled" />
          <span class="form-hint">关闭后所有商家完全透传，不做任何过滤</span>
        </el-form-item>

        <el-form-item label="关键字规则" prop="keywords">
          <el-input
            v-model="blacklistForm.keywords"
            type="textarea"
            :rows="6"
            placeholder="一行一条规则；行内 & 表示同时包含（AND）；多行为任一命中（OR）；大小写不敏感&#10;示例：&#10;肯德基&#10;麦当劳 & 优惠券&#10;华莱士 & 套餐"
          />
          <span class="form-hint">命中关键字的商家在监控推送和抢单时将被过滤</span>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="handleSaveBlacklist" :loading="blacklistSaving">保存</el-button>
          <el-button @click="loadBlacklist">重新读取</el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- 霸王餐刷任务（App / Android 登录态） -->
    <div class="settings-card lottery-card" v-loading="lotteryLoading">
      <div class="settings-sub-header">
        <h3 class="settings-title">霸王餐刷任务</h3>
        <p class="settings-desc">自动完成霸王餐抽奖页的"浏览/领取类"任务攒抽奖机会；登录态用小蚕 App（Android）抓包，比小程序登录态更长效；执行抽奖仍被风控验证拦，需手动完成</p>
      </div>

      <div class="lottery-toolbar">
        <el-button type="primary" @click="openAddAuth">录入登录态</el-button>
        <el-button @click="loadLotteryAuth">刷新列表</el-button>
      </div>

      <el-table :data="lotteryAuthList" empty-text="暂无登录态，点上方「录入登录态」" style="width: 100%">
        <el-table-column label="别名" prop="name" min-width="120" />
        <el-table-column label="silk_id" prop="silkId" width="120" />
        <el-table-column label="X-Session-Id" prop="sessionId" min-width="160" show-overflow-tooltip />
        <el-table-column label="城市码" prop="cityCode" width="90" />
        <el-table-column label="更新时间" prop="updateTime" width="160" />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button
              type="primary"
              size="small"
              :loading="runLoading === row.id"
              @click="handleRun(row.id)"
            >刷任务</el-button>
            <el-button size="small" type="danger" @click="handleDeleteAuth(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 刷任务结果 -->
      <div v-if="runResult" class="lottery-result">
        <div class="lottery-result-title">刷任务结果（{{ runResult.authName }}）</div>
        <div class="lottery-result-grid">
          <div class="lottery-result-cell">
            <span class="lottery-result-label">刷前机会数</span>
            <span class="lottery-result-value">{{ runResult.beforeCount ?? '—' }}</span>
          </div>
          <div class="lottery-result-cell">
            <span class="lottery-result-label">刷前当日累计</span>
            <span class="lottery-result-value">{{ runResult.beforeDayNum ?? '—' }}</span>
          </div>
          <div class="lottery-result-cell">
            <span class="lottery-result-label">刷后机会数</span>
            <span class="lottery-result-value">{{ runResult.afterCount ?? '—' }}</span>
          </div>
          <div class="lottery-result-cell">
            <span class="lottery-result-label">刷后当日累计</span>
            <span class="lottery-result-value">{{ runResult.afterDayNum ?? '—' }}</span>
          </div>
          <div class="lottery-result-cell">
            <span class="lottery-result-label">机会变化</span>
            <span class="lottery-result-value" :class="{ ok: runResult.afterCount - runResult.beforeCount > 0 }">{{ runResult.afterCount - runResult.beforeCount }}</span>
          </div>
        </div>

        <div v-if="runResult && runResult.tasks && runResult.tasks.length" class="lottery-tasks">
          <div class="lottery-tasks-title">完成明细</div>
          <div v-for="item in runResult.tasks" :key="item.type" class="lottery-task-item">
            <span class="lottery-task-type">{{ item.desc }}</span>
            <span class="lottery-task-state" :class="item.ok ? 'ok' : 'fail'">{{ item.ok ? '成功' : '失败' }}</span>
            <span class="lottery-task-msg" v-if="item.msg">{{ item.msg }}</span>
          </div>
        </div>

        <div v-if="runResult && runResult.error" class="lottery-result-error">{{ runResult.error }}</div>
      </div>
    </div>

    <!-- 录入登录态弹窗 -->
    <el-dialog
      v-model="authDialogVisible"
      :title="authEditingId != null ? '更新登录态' : '录入登录态'"
      width="640px"
      align-center
    >
      <el-form label-width="90px">
        <el-form-item label="别名">
          <el-input v-model="authForm.name" placeholder="如 主账号/小号" />
        </el-form-item>
        <el-form-item label="抓包header">
          <el-input
            v-model="authForm.rawHeaders"
            type="textarea"
            :rows="10"
            placeholder="粘贴小蚕 App（Android）抓包 header（需含 X-Session-Id、X-Sivir、x-Teemo；可粘贴抓包工具某条 gwh.xiaocantech.com/rpc 请求的 Request Headers，或抓包 JSON）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="authDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="authSaving" @click="handleSaveAuth">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
$primary: #4f6ef7;
$text-primary: #1a1a2e;
$text-secondary: #6b7280;
$text-hint: #9ca3af;
$card-bg: #ffffff;
$border: #e5e7eb;
$radius-md: 12px;
$radius-lg: 16px;

.settings-page {
  max-width: 640px;
  margin: 0 auto;
}

.settings-header {
  margin-bottom: 16px;
}

.settings-title {
  font-size: 20px;
  font-weight: 700;
  color: $text-primary;
  margin: 0 0 6px;
}

.settings-desc {
  font-size: 13px;
  color: $text-hint;
  margin: 0;
}

.settings-card {
  background: $card-bg;
  border-radius: $radius-lg;
  padding: 24px 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.form-hint {
  margin-left: 12px;
  font-size: 13px;
  color: $text-hint;
}

.config-form {
  :deep(.el-input-number) {
    width: 160px;
  }
}

.lottery-card {
  margin-top: 16px;
}

.settings-sub-header {
  margin-bottom: 16px;
}

.lottery-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.lottery-result {
  margin-top: 16px;
  padding: 16px;
  background: #f7f8fa;
  border-radius: $radius-md;
}

.lottery-result-title {
  font-size: 15px;
  font-weight: 600;
  color: $text-primary;
  margin-bottom: 12px;
}

.lottery-result-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.lottery-result-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lottery-result-label {
  font-size: 12px;
  color: $text-hint;
}

.lottery-result-value {
  font-size: 18px;
  font-weight: 600;
  color: $text-primary;
}

.lottery-result-value.ok {
  color: #22c55e;
}

.lottery-tasks {
  margin-top: 8px;
}

.lottery-tasks-title {
  font-size: 13px;
  font-weight: 600;
  color: $text-secondary;
  margin-bottom: 8px;
}

.lottery-task-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
}

.lottery-task-type {
  color: $text-primary;
  min-width: 120px;
}

.lottery-task-state.ok {
  color: #22c55e;
}

.lottery-task-state.fail {
  color: #ef4444;
}

.lottery-task-msg {
  color: $text-hint;
  font-size: 12px;
}

.lottery-result-error {
  margin-top: 8px;
  color: #ef4444;
  font-size: 13px;
}

@media screen and (max-width: 768px) {
  .config-form {
    :deep(.el-form-item__label) {
      font-size: 13px;
    }
  }
}
</style>
