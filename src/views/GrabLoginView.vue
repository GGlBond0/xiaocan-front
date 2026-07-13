<script setup lang="ts">
import { ref, onMounted, inject } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'

const authState = inject<{
  isAuthenticated: { value: boolean }
  setAuthenticated: () => void
  waitForAuth: () => Promise<void>
}>('authState')!

const rawHeaders = ref('')
const saving = ref(false)
const loginState = ref<any>(null)
const loadingState = ref(false)

async function loadLoginState() {
  loadingState.value = true
  try {
    const res = await api.get('/api/grab/login-state')
    loginState.value = res.data.data
  } catch {
    /* interceptor handles */
  } finally {
    loadingState.value = false
  }
}

async function handleSave() {
  const text = rawHeaders.value.trim()
  if (!text) {
    ElMessage.warning('请粘贴抓包 header（含 X-Sivir / X-Session-Id 等）')
    return
  }
  saving.value = true
  try {
    const res = await api.post('/api/grab/login-state', { rawHeaders: text })
    ElMessage.success(res.data.data?.msg || '登录态已保存')
    rawHeaders.value = ''
    await loadLoginState()
  } catch {
    /* interceptor handles */
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await authState?.waitForAuth?.()
  await loadLoginState()
})
</script>

<template>
  <div class="grab-login-view">
    <div class="page-card">
      <h2 class="page-title">抢单登录态绑定</h2>
      <p class="page-desc">
        抢单需登录态。在小蚕 App 抓包一次抢单请求，把请求头（含 X-Sivir / X-Session-Id / X-Teemo /
        X-Vayne / X-Nami）整段粘贴到下方，系统会自动解析保存。JWT 过期后需重新录入。
      </p>

      <div class="state-box" v-loading="loadingState">
        <template v-if="loginState">
          <el-tag :type="loginState.success ? 'success' : 'info'">
            {{ loginState.success ? '已绑定' : '未绑定' }}
          </el-tag>
          <span class="state-msg">{{ loginState.msg }}</span>
        </template>
        <el-button size="small" @click="loadLoginState">刷新</el-button>
      </div>

      <el-input
        v-model="rawHeaders"
        type="textarea"
        :rows="12"
        placeholder="在此粘贴抓包 header，例如：&#10;X-Sivir: eyJ...&#10;X-Session-Id: 925d8dc4-...&#10;X-Teemo: 222559356&#10;X-Vayne: 5263106&#10;X-Nami: 6762225593567970&#10;&#10;或直接粘贴抓包导出的整段 JSON（含 headers 节点）"
        class="header-input"
      />
      <el-button type="primary" :loading="saving" @click="handleSave" class="save-btn">
        解析并保存
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.grab-login-view {
  max-width: 760px;
  margin: 0 auto;
}
.page-card {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 16px;
  padding: 28px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.18);
}
.page-title {
  margin: 0 0 8px;
  color: #2c3e50;
}
.page-desc {
  color: #909399;
  font-size: 14px;
  line-height: 1.6;
  margin: 0 0 20px;
}
.state-box {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.state-msg {
  color: #606266;
  font-size: 14px;
}
.header-input :deep(.el-textarea__inner) {
  font-family: 'Courier New', monospace;
  font-size: 13px;
  border-radius: 10px;
}
.save-btn {
  margin-top: 16px;
  height: 44px;
  border-radius: 12px;
  font-weight: 600;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
}
.save-btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}
</style>
