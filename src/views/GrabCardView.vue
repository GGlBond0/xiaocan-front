<script setup lang="ts">
import { ref, onMounted, inject } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'

const authState = inject<{
  isAuthenticated: { value: boolean }
  setAuthenticated: () => void
  waitForAuth: () => Promise<void>
}>('authState')!

const loginStateList = ref<any[]>([])
const selectedLoginStateId = ref<number | null>(null)
const cardList = ref<any[]>([])
const loading = ref(false)
const query = ref({ number: 15, offset: 0, status: 0 })

async function loadLoginStates() {
  try {
    const res = await api.get('/api/grab/login-state/list')
    loginStateList.value = res.data.data || []
    if (loginStateList.value.length > 0) {
      selectedLoginStateId.value = loginStateList.value[0].id
      await loadCards()
    }
  } catch { /* ignore */ }
}

async function loadCards() {
  if (selectedLoginStateId.value == null) {
    ElMessage.warning('请先选择登录态')
    return
  }
  loading.value = true
  try {
    const res = await api.get('/api/grab/card/list', {
      loginStateId: selectedLoginStateId.value,
      number: query.value.number,
      offset: query.value.offset,
      status: query.value.status,
    })
    cardList.value = res.data.data || []
  } finally {
    loading.value = false
  }
}

function cardTypeLabel(t: number) {
  return { 1: '超抢券', 2: '延时券', 4: '延时券', 6: '单号修改券', 9: '探店券' }[t] || ('type' + t)
}

function isExpired(exp: string) {
  return exp ? new Date(exp).getTime() < Date.now() : false
}

onMounted(async () => {
  await authState?.waitForAuth?.()
  await loadLoginStates()
})
</script>

<template>
  <div class="grab-card-view">
    <div class="page-card">
      <div class="header-row">
        <h2 class="page-title">卡券查询</h2>
        <div class="toolbar">
          <el-select v-model="selectedLoginStateId" placeholder="选择登录态" style="width: 200px"
            @change="loadCards">
            <el-option v-for="s in loginStateList" :key="s.id"
              :label="`${s.name}（用户${s.xcUserId}）`" :value="s.id" />
          </el-select>
          <el-input-number v-model="query.number" :min="1" :max="50" size="small" />
          <el-input-number v-model="query.offset" :min="0" :step="query.number" size="small" />
          <el-button size="small" @click="loadCards" :loading="loading">查询</el-button>
        </div>
      </div>

      <div v-if="cardList.length === 0 && !loading" class="empty">暂无卡券</div>
      <div class="card-grid" v-loading="loading">
        <div v-for="c in cardList" :key="c.id" class="card-item"
          :class="{ expired: isExpired(c.expireTime) }">
          <img :src="c.pic" class="card-pic" :alt="c.name" />
          <div class="card-info">
            <div class="card-name">{{ c.name }}
              <el-tag size="small" :type="isExpired(c.expireTime) ? 'info' : 'success'">
                {{ cardTypeLabel(c.cardType) }}
              </el-tag>
            </div>
            <div class="card-desc">{{ c.desc }}</div>
            <div class="card-meta">
              <span>领取: {{ c.createdAt }}</span>
              <span :class="{ 'exp-soon': isExpired(c.expireTime) }">过期: {{ c.expireTime }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.grab-card-view { max-width: 1100px; margin: 0 auto; }
.page-card {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}
.header-row {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 16px; flex-wrap: wrap; gap: 10px;
}
.page-title { margin: 0; color: #2c3e50; }
.toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.empty { text-align: center; color: #c0c4cc; padding: 40px 0; }
.card-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}
.card-item {
  display: flex; gap: 12px; padding: 12px;
  border: 1px solid #ebeef5; border-radius: 12px; background: #fff;
  transition: box-shadow .2s;
}
.card-item:hover { box-shadow: 0 4px 14px rgba(0,0,0,0.08); }
.card-item.expired { opacity: 0.55; }
.card-pic { width: 56px; height: 56px; border-radius: 10px; object-fit: cover; flex-shrink: 0; }
.card-info { flex: 1; min-width: 0; }
.card-name { font-weight: 600; color: #303133; display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.card-desc { color: #909399; font-size: 12px; line-height: 1.5; margin-bottom: 6px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.card-meta { font-size: 11px; color: #c0c4cc; display: flex; justify-content: space-between; }
.exp-soon { color: #f56c6c; }
</style>
