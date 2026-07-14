<script setup lang="ts">
import { ref, reactive, onMounted, inject } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../api'

const authState = inject<{
  isAuthenticated: { value: boolean }
  setAuthenticated: () => void
  waitForAuth: () => Promise<void>
}>('authState')!

const list = ref<any[]>([])
const locationList = ref<any[]>([])
const loading = ref(false)

// 录入/编辑弹窗
const dialogVisible = ref(false)
const saving = ref(false)
const editingId = ref<number | null>(null)
const form = reactive({ name: '', rawHeaders: '', locationId: null as number | null })

function statusType(s: string) {
  return { '有效': 'success', '即将过期': 'warning', '已过期': 'danger', '未知': 'info' }[s] || 'info'
}

async function loadList() {
  loading.value = true
  try {
    const res = await api.get('/api/login-state/list')
    list.value = res.data.data || []
  } catch {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

async function loadLocations() {
  try {
    const res = await api.get('/api/location')
    locationList.value = res.data.data || []
  } catch {
    // 地址列表非必需，静默
  }
}

function openAdd() {
  editingId.value = null
  form.name = ''
  form.rawHeaders = ''
  form.locationId = null
  dialogVisible.value = true
}

function openEdit(row: any) {
  editingId.value = row.id
  form.name = row.name || ''
  form.rawHeaders = ''
  form.locationId = row.locationId ?? null
  dialogVisible.value = true
}

async function handleSave() {
  if (!form.rawHeaders.trim()) {
    ElMessage.warning('请粘贴抓包 header（需含 X-Sivir / X-Session-Id）')
    return
  }
  saving.value = true
  try {
    const payload: any = { name: form.name, rawHeaders: form.rawHeaders }
    if (form.locationId != null) payload.locationId = form.locationId
    const config = editingId.value != null ? { params: { id: editingId.value } } : undefined
    await api.post('/api/login-state', payload, config)
    ElMessage.success('登录态已保存')
    dialogVisible.value = false
    await loadList()
  } catch {
    // 拦截器已提示
  } finally {
    saving.value = false
  }
}

async function handleDelete(row: any) {
  try {
    await ElMessageBox.confirm(`确定删除登录态「${row.name}」？关联的抢单配置将失效。`, '提示', { type: 'warning' })
  } catch {
    return
  }
  try {
    await api.delete(`/api/login-state/${row.id}`)
    ElMessage.success('已删除')
    await loadList()
  } catch {
    // 拦截器已提示
  }
}

onMounted(async () => {
  await authState?.waitForAuth?.()
  await Promise.all([loadList(), loadLocations()])
})
</script>

<template>
  <div class="login-state-view">
    <div class="page-card">
      <div class="header-row">
        <h2 class="page-title">登录态管理</h2>
        <div class="toolbar">
          <el-button @click="loadList" :loading="loading">刷新</el-button>
          <el-button type="primary" @click="openAdd">新增登录态</el-button>
        </div>
      </div>
      <p class="page-desc">统一管理抢单与霸王餐刷任务用的小蚕登录态。同一个小蚕账号会自动更新而非重复新增。</p>

      <el-table :data="list" v-loading="loading" style="width: 100%" stripe>
        <el-table-column prop="name" label="别名" min-width="120" show-overflow-tooltip />
        <el-table-column prop="userVayne" label="小蚕用户ID" width="110" />
        <el-table-column prop="silkId" label="silk_id" width="110" />
        <el-table-column label="城市码" width="90">
          <template #default="{ row }">{{ row.cityCode || '-' }}</template>
        </el-table-column>
        <el-table-column label="过期状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusType(row.expireStatus)">{{ row.expireStatus }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="绑定地址" min-width="140">
          <template #default="{ row }">
            {{ row.locationName || '未绑定' }}
          </template>
        </el-table-column>
        <el-table-column prop="updateTime" label="更新时间" width="160" />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 录入/编辑登录态弹窗 -->
    <el-dialog v-model="dialogVisible" :title="editingId != null ? '编辑登录态' : '新增登录态'" width="640px" align-center>
      <el-form label-width="100px">
        <el-form-item label="别名">
          <el-input v-model="form.name" placeholder="如 主账号/小号" />
        </el-form-item>
        <el-form-item label="绑定地址">
          <el-select v-model="form.locationId" placeholder="留空表示不绑地址" clearable style="width: 100%">
            <el-option v-for="l in locationList" :key="l.id" :label="`${l.name}(${l.address})`" :value="l.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="抓包header">
          <el-input v-model="form.rawHeaders" type="textarea" :rows="10"
            placeholder="粘贴抓包 header（需含 X-Sivir / X-Session-Id / X-Vayne / X-Teemo / X-Nami）或抓包 JSON" />
        </el-form-item>
        <div class="hint">{{ editingId != null ? '编辑需重新粘贴抓包 header，同一小蚕账号会覆盖原记录。' : '同一个小蚕账号会自动更新而非重复新增。换 token 或改名直接重新粘贴即可。' }}</div>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.login-state-view {
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
  margin-bottom: 8px;
}
.page-title {
  margin: 0;
  color: #2c3e50;
}
.toolbar {
  display: flex;
  gap: 10px;
}
.page-desc {
  margin: 0 0 16px;
  color: #909399;
  font-size: 13px;
}
.hint {
  margin-left: 10px;
  color: #e6a23c;
  font-size: 12px;
}
</style>
