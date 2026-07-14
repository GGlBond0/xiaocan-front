<script setup lang="ts">
import { ref, onMounted, inject } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import api from '../api'

const router = useRouter()
const authState = inject<{
  isAuthenticated: { value: boolean }
  setAuthenticated: () => void
  waitForAuth: () => Promise<void>
}>('authState')!

const stateList = ref<any[]>([])
const loading = ref(false)

async function loadList() {
  loading.value = true
  try {
    const res = await api.get('/api/grab/login-state/list')
    stateList.value = res.data.data || []
  } finally {
    loading.value = false
  }
}

// 仅保留删除（用于清理无法迁移的老记录）；新增/更新入口已下线，请到地址管理页管理登录态
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

function goLocation() {
  router.push('/location')
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
        <el-button type="primary" @click="goLocation">去地址管理页管理</el-button>
      </div>
      <el-alert
        class="migrate-tip"
        type="warning"
        :closable="false"
        show-icon
        title="登录态已改为在「地址管理」页按地址管理"
        description="新增、更新登录态请进入对应地址卡片操作。此处仅保留只读列表与删除，便于迁移未绑地址的老记录（locationId 为空）。"
      />

      <el-table :data="stateList" v-loading="loading" style="width: 100%" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="name" label="别名" width="140" />
        <el-table-column prop="xcUserId" label="小蚕用户ID" width="110" />
        <el-table-column prop="silkId" label="silk_id" width="110" />
        <el-table-column label="所属地址" width="140">
          <template #default="{ row }">
            <el-tag v-if="row.locationId" size="small" type="success">{{ row.locationName || row.locationId }}</el-tag>
            <el-tag v-else size="small" type="warning">未绑定</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="expireAt" label="过期时间" width="180" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.expireStatus)">{{ row.expireStatus }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
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
.migrate-tip {
  margin: 16px 0;
}
</style>
