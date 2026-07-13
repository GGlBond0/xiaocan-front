<script setup lang="ts">
import { ref, onMounted, inject } from 'vue'
import api from '../api'

const authState = inject<{
  isAuthenticated: { value: boolean }
  setAuthenticated: () => void
  waitForAuth: () => Promise<void>
}>('authState')!

const historyList = ref<any[]>([])
const loading = ref(false)
const limit = ref(50)

async function loadHistory() {
  loading.value = true
  try {
    const res = await api.get('/api/grab/history/list', { limit: limit.value })
    historyList.value = res.data.data || []
  } finally {
    loading.value = false
  }
}

function triggerType(t: string) {
  return { MANUAL: '手动', CRON: '定时', ONESHOT: '一次性' }[t] || t
}

onMounted(async () => {
  await authState?.waitForAuth?.()
  await loadHistory()
})
</script>

<template>
  <div class="grab-history-view">
    <div class="page-card">
      <div class="header-row">
        <h2 class="page-title">抢单记录</h2>
        <div class="toolbar">
          <el-input-number v-model="limit" :min="10" :max="500" :step="50" size="small" />
          <el-button size="small" @click="loadHistory" :loading="loading">刷新</el-button>
        </div>
      </div>

      <el-table :data="historyList" v-loading="loading" style="width: 100%" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="grabConfigId" label="配置ID" width="80" />
        <el-table-column prop="promotionId" label="活动ID" width="110" />
        <el-table-column prop="startTime" label="时间" width="180" />
        <el-table-column label="触发" width="80">
          <template #default="{ row }">{{ triggerType(row.triggerType) }}</template>
        </el-table-column>
        <el-table-column prop="attempt" label="次数" width="60" />
        <el-table-column label="结果" width="90">
          <template #default="{ row }">
            <el-tag :type="row.success ? 'success' : 'danger'">
              {{ row.success ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="respCode" label="code" width="70" />
        <el-table-column prop="respMsg" label="消息" show-overflow-tooltip />
        <el-table-column prop="promotionOrderId" label="订单号" width="130" />
      </el-table>

      <div v-if="!loading && historyList.length === 0" class="empty">暂无抢单记录</div>
    </div>
  </div>
</template>

<style scoped>
.grab-history-view {
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
.toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
}
.empty {
  text-align: center;
  color: #c0c4cc;
  padding: 40px 0;
}
</style>
