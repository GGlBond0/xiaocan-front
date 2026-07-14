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
const pageSize = 15
const page = ref(1)
const hasMore = ref(false)
// 饭票数量汇总（来自 /api/grab/card/count，ticketCount 为饭票 cardId==1 张数）
const cardCount = ref<{ ticketCount: number; details: any[] } | null>(null)
const countLoading = ref(false)

async function loadLoginStates() {
  try {
    const res = await api.get('/api/grab/login-state/list')
    loginStateList.value = res.data.data || []
    if (loginStateList.value.length > 0) {
      selectedLoginStateId.value = loginStateList.value[0].id
      await loadCards()
      await loadCardCount()
    }
  } catch { /* ignore */ }
}

async function loadCardCount() {
  if (selectedLoginStateId.value == null) return
  countLoading.value = true
  try {
    const res = await api.get('/api/grab/card/count', {
      loginStateId: selectedLoginStateId.value,
    })
    cardCount.value = res.data.data || null
  } catch {
    cardCount.value = null
  } finally {
    countLoading.value = false
  }
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
      number: pageSize,
      offset: (page.value - 1) * pageSize,
      status: 0,
    })
    cardList.value = res.data.data || []
    // 返回满页则可能有下一页
    hasMore.value = cardList.value.length === pageSize
  } finally {
    loading.value = false
  }
}

function prevPage() {
  if (page.value > 1) {
    page.value--
    loadCards()
  }
}
function nextPage() {
  if (hasMore.value) {
    page.value++
    loadCards()
  }
}
function onLoginStateChange() {
  page.value = 1
  loadCards()
  loadCardCount()
}

// 卡券类型标签：优先用 card_type 映射，未知/缺失则回退到卡券自身 name（饭票 cardType 为 null 等）
function cardTypeLabel(t: number | null | undefined, name?: string) {
  const map: Record<number, string> = {
    1: '超前抢单券',
    2: '延时券',
    4: '延时券',
    6: '单号修改券',
    9: '探店券',
  }
  if (t != null && map[t]) return map[t]
  return name || (t == null ? '卡券' : 'type' + t)
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
            @change="onLoginStateChange">
            <el-option v-for="s in loginStateList" :key="s.id"
              :label="`${s.name}（用户${s.xcUserId}）`" :value="s.id" />
          </el-select>
          <el-button size="small" @click="loadCards" :loading="loading">刷新</el-button>
          <el-button size="small" @click="prevPage" :disabled="page <= 1">上一页</el-button>
          <span class="page-info">第 {{ page }} 页</span>
          <el-button size="small" @click="nextPage" :disabled="!hasMore">下一页</el-button>
        </div>
      </div>

      <div v-if="cardList.length === 0 && !loading" class="empty">暂无卡券</div>

      <div class="card-count-bar" v-loading="countLoading">
        <template v-if="cardCount">
          <span class="count-item ticket">
            饭票：<b>{{ cardCount.ticketCount ?? 0 }}</b> 张
            <el-tag v-if="(cardCount.ticketCount ?? 0) === 0" size="small" type="danger">不足</el-tag>
          </span>
          <span v-for="d in cardCount.details.filter(x => x.cardId !== 1)" :key="d.cardId" class="count-item">
            {{ d.name }}：<b>{{ d.count }}</b>
          </span>
        </template>
        <span v-else class="count-empty">饭票数量加载中…</span>
      </div>
      <div class="card-grid" v-loading="loading">
        <div v-for="c in cardList" :key="c.id" class="card-item"
          :class="{ expired: isExpired(c.expireTime) }">
          <img :src="c.pic" class="card-pic" :alt="c.name" />
          <div class="card-info">
            <div class="card-name">{{ c.name }}
              <el-tag size="small" :type="isExpired(c.expireTime) ? 'info' : 'success'">
                {{ cardTypeLabel(c.cardType, c.name) }}
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
.page-info { color: #606266; font-size: 13px; }
.empty { text-align: center; color: #c0c4cc; padding: 40px 0; }
.card-count-bar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px;
  padding: 12px 14px; margin-bottom: 16px;
  background: #f5f7fa; border-radius: 10px; font-size: 13px; color: #606266;
  min-height: 24px;
}
.count-item { display: inline-flex; align-items: center; gap: 4px; }
.count-item b { color: #303133; font-size: 15px; }
.count-item.ticket { color: #e6a23c; font-weight: 600; }
.count-item.ticket b { color: #e6a23c; }
.count-empty { color: #c0c4cc; }
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
