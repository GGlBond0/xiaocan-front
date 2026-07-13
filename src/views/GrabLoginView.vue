<script setup lang="ts">
import { ref, onMounted, inject } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../api'

const authState = inject<{
  isAuthenticated: { value: boolean }
  setAuthenticated: () => void
  waitForAuth: () => Promise<void>
}>('authState')!

const stateList = ref<any[]>([])
const loading = ref(false)
const saving = ref(false)

const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const form = ref({ name: '', rawHeaders: '' })

async function loadList() {
  loading.value = true
  try {
    const res = await api.get('/api/grab/login-state/list')
    stateList.value = res.data.data || []
  } finally {
    loading.value = false
  }
}

function openAdd() {
  editingId.value = null
  form.value = { name: '', rawHeaders: '' }
  dialogVisible.value = true
}

function openEdit(row: any) {
  editingId.value = row.id
  form.value = { name: row.name, rawHeaders: '' }
  dialogVisible.value = true
}

async function handleSave() {
  if (!form.value.rawHeaders.trim()) {
    ElMessage.warning('请粘贴抓包 header')
    return
  }
  saving.value = true
  try {
    const config = editingId.value != null ? { params: { id: editingId.value } } : undefined
    const res = await api.post('/api/grab/login-state', form.value, config)
    ElMessage.success(res.data.data?.msg || '已保存')
    dialogVisible.value = false
    await loadList()
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
  await api.delete(`/api/grab/login-state/${row.id}`)
  ElMessage.success('已删除')
  await loadList()
}

function statusType(s: string) {
  return { '有效': 'success', '即将过期': 'warning', '已过期': 'danger', '未知': 'info' }[s] || 'info'
}

onMounted(async () => {
  await authState?.waitForAuth?.()
  await loadList()
})
</script>

<template>
  <div class="grab-login-view">
    <div class="page-card">
      <div class="header-row">
        <h2 class="page-title">抢单登录态</h2>
        <el-button type="primary" @click="openAdd">新增登录态</el-button>
      </div>
      <p class="page-desc">
        可保存多组小蚕登录态（如主账号/小号）。在小蚕 App 抓包一次抢单请求，把请求头整段粘贴录入。
        抢单配置可绑定其中一组。JWT 过期后需重新录入。
      </p>

      <el-table :data="stateList" v-loading="loading" style="width: 100%" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="name" label="别名" width="140" />
        <el-table-column prop="xcUserId" label="小蚕用户ID" width="110" />
        <el-table-column prop="silkId" label="silk_id" width="110" />
        <el-table-column prop="expireAt" label="过期时间" width="180" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.expireStatus)">{{ row.expireStatus }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">更新</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" :title="editingId != null ? '更新登录态' : '新增登录态'" width="560px" align-center>
      <el-form label-width="90px">
        <el-form-item label="别名">
          <el-input v-model="form.name" placeholder="如 主账号/小号" />
        </el-form-item>
        <el-form-item label="抓包header">
          <el-input v-model="form.rawHeaders" type="textarea" :rows="10"
            placeholder="粘贴抓包 header（含 X-Sivir/X-Session-Id/X-Vayne/X-Teemo/X-Nami）或抓包 JSON" />
        </el-form-item>
        <div v-if="editingId != null" class="hint">留空则保留原登录态，填写则覆盖（重新抓包后粘贴新值）。</div>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.grab-login-view {
  max-width: 1000px;
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
.page-desc {
  color: #909399;
  font-size: 13px;
  line-height: 1.6;
  margin: 0 0 16px;
}
.hint {
  color: #e6a23c;
  font-size: 12px;
}
</style>
