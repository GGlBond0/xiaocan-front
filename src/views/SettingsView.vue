<script setup lang="ts">
import { ref, reactive, onMounted, inject } from 'vue'
import { ElMessage } from 'element-plus'
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

onMounted(async () => {
  await authState?.waitForAuth()
  await Promise.all([loadConfig(), loadBlacklist()])
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

@media screen and (max-width: 768px) {
  .config-form {
    :deep(.el-form-item__label) {
      font-size: 13px;
    }
  }
}
</style>
