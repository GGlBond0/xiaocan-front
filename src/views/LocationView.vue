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

const addressList = ref<any[]>([])
const regionOptions = ref<any[]>([])
const regionProps = { value: 'code', label: 'name', children: 'child' }

const formRef = ref<FormInstance>()
const form = reactive({
  id: null as string | null,
  name: '',
  address: '',
  region: [] as string[],
  cityCode: null as number | null,
  addressKeyword: '',
  selectedAddress: null as any
})

const rules = {
  region: [{ required: true, message: '请选择所在地区', trigger: 'change' }],
  selectedAddress: [{ required: true, message: '请选择详细地址', trigger: 'change' }]
}

const isAdding = ref(false)
const isEditing = ref(false)
const loading = ref(false)

// 每个地址卡片下两个折叠面板的展开状态：key=locationId
const expandedLogin = ref<Set<string>>(new Set())
const expandedSpt = ref<Set<string>>(new Set())

// 所有登录态（全量，按 locationId 过滤展示）
const allLoginStates = ref<any[]>([])
// 每个地址的推送 spt 缓存：locationId -> spt 列表
const pushTargetMap = ref<Record<string, any[]>>({})

async function loadAddressList() {
  loading.value = true
  try {
    const response = await api.get('/api/location')
    if (response.data.success) {
      addressList.value = response.data.data || []
      // 展开后加载各自登录态/spt
      await loadLoginStates()
      for (const addr of addressList.value) {
        if (expandedSpt.value.has(String(addr.id))) {
          loadPushTargets(addr.id)
        }
      }
    } else {
      ElMessage.error(response.data.msg || '获取地址列表失败')
    }
  } catch {
    ElMessage.error('获取地址列表失败，请检查网络连接')
  } finally {
    loading.value = false
  }
}

async function loadRegionOptions() {
  try {
    const response = await api.get('/api/location/cityCode')
    if (response.data.success) {
      regionOptions.value = response.data.data || []
    } else {
      ElMessage.error('获取地区数据失败')
    }
  } catch {
    ElMessage.error('获取地区数据失败，请检查网络连接')
  }
}

function startAddAddress() {
  isAdding.value = true
  isEditing.value = false
  resetForm()
}

function startEditAddress(address: any) {
  isEditing.value = true
  isAdding.value = false
  form.id = address.id
  form.name = address.name
  form.address = address.address
  form.region = []
  form.cityCode = address.cityCode
  form.addressKeyword = ''
  form.selectedAddress = null
}

async function queryAddress(queryString: string, callback: (results: any[]) => void) {
  if (!form.cityCode || !queryString.trim()) {
    callback([])
    return
  }

  try {
    const response = await api.get('/api/location/searchAddress', {
      keyword: queryString.trim(),
      cityCode: form.cityCode,
    })
    if (response.data.success) {
      const addresses = (response.data.data || []).map((item: any) => ({
        value: item.title,
        title: item.title,
        address: item.address,
        latitude: item.latitude,
        longitude: item.longitude,
        cityCode: item.cityCode,
        province: item.province,
        city: item.city,
        district: item.district,
      }))
      callback(addresses)
    } else {
      callback([])
    }
  } catch {
    callback([])
  }
}

function cancelOperation() {
  isAdding.value = false
  isEditing.value = false
  resetForm()
}

function resetForm() {
  form.id = null
  form.name = ''
  form.address = ''
  form.region = []
  form.cityCode = null
  form.addressKeyword = ''
  form.selectedAddress = null
  formRef.value?.resetFields()
}

function handleRegionChange(values: string[]) {
  if (values && values.length > 0) {
    form.cityCode = parseInt(values[values.length - 1] ?? '0')
  } else {
    form.cityCode = null
    form.selectedAddress = null
    form.addressKeyword = ''
  }
}

function handleAddressSelect(item: any) {
  form.selectedAddress = item
}

async function submitForm() {
  formRef.value?.validate(async (valid: boolean) => {
    if (valid) {
      const submitData = {
        name: form.selectedAddress.title,
        address: form.selectedAddress.address,
        cityCode: form.cityCode,
        latitude: form.selectedAddress.latitude,
        longitude: form.selectedAddress.longitude,
      }

      loading.value = true
      try {
        const response = await api.post('/api/location', submitData)
        if (response.data.success) {
          ElMessage.success('地址新增成功')
          await loadAddressList()
          isAdding.value = false
          resetForm()
        } else {
          ElMessage.error(response.data.msg || '地址新增失败')
        }
      } catch {
        ElMessage.error('新增地址失败，请检查网络连接')
      } finally {
        loading.value = false
      }
    }
  })
}

function deleteAddress(id: string, index: number) {
  ElMessageBox.confirm('确定要删除这个地址吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(async () => {
      loading.value = true
      try {
        const response = await api.delete(`/api/location/${id}`)
        if (response.data.success) {
          ElMessage.success('地址删除成功')
          await loadAddressList()
        } else {
          ElMessage.error(response.data.msg || '地址删除失败')
        }
      } catch {
        ElMessage.error('删除地址失败，请检查网络连接')
      } finally {
        loading.value = false
      }
    })
    .catch(() => {
      ElMessage.info('已取消删除')
    })
}

// ==================== 抢单登录态绑定 ====================

async function loadLoginStates() {
  try {
    const res = await api.get('/api/grab/login-state/list')
    allLoginStates.value = res.data.data || []
  } catch {
    // 静默失败，不阻塞地址列表
  }
}

function loginStatesOf(locationId: string) {
  return allLoginStates.value.filter((s: any) => String(s.locationId) === String(locationId))
}

async function toggleLogin(locationId: string) {
  if (expandedLogin.value.has(String(locationId))) {
    expandedLogin.value.delete(String(locationId))
  } else {
    expandedLogin.value.add(String(locationId))
    if (allLoginStates.value.length === 0) await loadLoginStates()
  }
}

// 新增登录态对话框
const loginDialogVisible = ref(false)
const loginDialogLocationId = ref<string | null>(null)
const loginForm = reactive({ name: '', rawHeaders: '' })
const loginEditingId = ref<number | null>(null)
const loginSaving = ref(false)

function openAddLogin(locationId: string) {
  loginDialogLocationId.value = locationId
  loginEditingId.value = null
  loginForm.name = ''
  loginForm.rawHeaders = ''
  loginDialogVisible.value = true
}

function openEditLogin(row: any) {
  loginEditingId.value = row.id
  loginDialogLocationId.value = row.locationId
  loginForm.name = row.name
  loginForm.rawHeaders = ''
  loginDialogVisible.value = true
}

async function saveLoginState() {
  if (!loginForm.rawHeaders.trim()) {
    ElMessage.warning('请粘贴抓包 header')
    return
  }
  loginSaving.value = true
  try {
    const config = loginEditingId.value != null ? { params: { id: loginEditingId.value } } : undefined
    const payload: any = { name: loginForm.name, rawHeaders: loginForm.rawHeaders }
    if (loginEditingId.value == null && loginDialogLocationId.value) {
      payload.locationId = Number(loginDialogLocationId.value)
    }
    const res = await api.post('/api/grab/login-state', payload, config)
    ElMessage.success(res.data.data?.msg || '已保存')
    loginDialogVisible.value = false
    await loadLoginStates()
  } catch {
    // 拦截器已提示
  } finally {
    loginSaving.value = false
  }
}

async function deleteLogin(row: any) {
  try {
    await ElMessageBox.confirm(`确定删除登录态「${row.name}」？关联的抢单配置将失效。`, '提示', { type: 'warning' })
  } catch {
    return
  }
  await api.delete(`/api/grab/login-state/${row.id}`)
  ElMessage.success('已删除')
  await loadLoginStates()
}

// ==================== 推送 spt 绑定 ====================

async function loadPushTargets(locationId: string) {
  try {
    const res = await api.get(`/api/location/${locationId}/push-target`)
    pushTargetMap.value[String(locationId)] = res.data.data || []
  } catch {
    pushTargetMap.value[String(locationId)] = []
  }
}

function pushTargetsOf(locationId: string) {
  return pushTargetMap.value[String(locationId)] || []
}

async function toggleSpt(locationId: string) {
  if (expandedSpt.value.has(String(locationId))) {
    expandedSpt.value.delete(String(locationId))
  } else {
    expandedSpt.value.add(String(locationId))
    await loadPushTargets(locationId)
  }
}

// 新增/编辑 spt 对话框
const sptDialogVisible = ref(false)
const sptEditingId = ref<number | null>(null)
const sptDialogLocationId = ref<string | null>(null)
const sptForm = reactive({ id: null as number | null, spt: '', remark: '', enabled: true, sort: 0 })
const sptSaving = ref(false)

function openAddSpt(locationId: string) {
  sptDialogLocationId.value = locationId
  sptEditingId.value = null
  sptForm.id = null
  sptForm.spt = ''
  sptForm.remark = ''
  sptForm.enabled = true
  sptForm.sort = 0
  sptDialogVisible.value = true
}

function openEditSpt(row: any, locationId: string) {
  sptDialogLocationId.value = locationId
  sptEditingId.value = row.id
  sptForm.id = row.id
  sptForm.spt = row.spt
  sptForm.remark = row.remark || ''
  sptForm.enabled = row.enabled
  sptForm.sort = row.sort || 0
  sptDialogVisible.value = true
}

async function saveSpt() {
  if (!sptForm.spt.trim()) {
    ElMessage.warning('请填写 spt')
    return
  }
  sptSaving.value = true
  try {
    if (sptEditingId.value != null) {
      await api.put(`/api/location/${sptDialogLocationId.value}/push-target`, {
        id: sptForm.id,
        spt: sptForm.spt.trim(),
        remark: sptForm.remark,
        enabled: sptForm.enabled,
        sort: sptForm.sort,
      })
    } else {
      await api.post(`/api/location/${sptDialogLocationId.value}/push-target`, {
        spt: sptForm.spt.trim(),
        remark: sptForm.remark,
        enabled: sptForm.enabled,
        sort: sptForm.sort,
      })
    }
    ElMessage.success('已保存')
    sptDialogVisible.value = false
    await loadPushTargets(sptDialogLocationId.value!)
  } catch {
    // 拦截器已提示
  } finally {
    sptSaving.value = false
  }
}

async function toggleSptEnabled(row: any, locationId: string) {
  try {
    await api.put(`/api/location/${locationId}/push-target`, {
      id: row.id,
      enabled: row.enabled,
    })
    ElMessage.success(row.enabled ? '已启用' : '已停用')
  } catch {
    // 失败回滚
    row.enabled = !row.enabled
  }
}

async function deleteSpt(row: any, locationId: string) {
  try {
    await ElMessageBox.confirm('确定删除该推送 spt？', '提示', { type: 'warning' })
  } catch {
    return
  }
  await api.delete(`/api/location/${locationId}/push-target/${row.id}`)
  ElMessage.success('已删除')
  await loadPushTargets(locationId)
}

async function testPush(locationId: string) {
  try {
    await api.post(`/api/location/${locationId}/push-target/test`)
    ElMessage.success('已发送测试推送，请到对应微信查看')
  } catch {
    // 拦截器已提示
  }
}

function loginStatusType(s: string) {
  return { '有效': 'success', '即将过期': 'warning', '已过期': 'danger', '未知': 'info' }[s] || 'info'
}

onMounted(async () => {
  await authState?.waitForAuth()
  loadAddressList()
  loadRegionOptions()
})
</script>

<template>
  <div>
    <!-- Address list -->
    <el-card
      v-if="!isAdding && !isEditing"
      class="address-list-card mt-4"
      v-loading="loading"
    >
      <template #header>
        <div class="card-header">
          <span>已保存的地址</span>
          <el-button class="add-address-btn" @click="startAddAddress" :disabled="loading">
            新增地址
          </el-button>
        </div>
      </template>

      <div v-if="addressList.length === 0" class="empty-state">
        <el-empty description="暂无保存的地址">
          <el-button class="add-address-btn" @click="startAddAddress"> 新增第一个地址 </el-button>
        </el-empty>
      </div>

      <div v-else class="address-grid mt-4">
        <el-card
          v-for="(address, index) in addressList"
          :key="address.id"
          class="address-card"
          :style="{ animationDelay: index * 0.1 + 's' }"
        >
          <div>
            <div class="address-header">
              <div class="address-name">{{ address.name }}</div>
            </div>

            <p class="address-main">{{ address.address }}</p>

            <!-- 抢单登录态绑定段 -->
            <div class="binding-section">
              <div class="binding-title" @click="toggleLogin(address.id)">
                <span>
                  <el-icon class="toggle-icon" :class="{ expanded: expandedLogin.has(String(address.id)) }">▶</el-icon>
                  抢单登录态
                  <el-tag size="small" type="info" class="count-tag">{{ loginStatesOf(address.id).length }}</el-tag>
                </span>
                <el-button size="small" @click.stop="openAddLogin(address.id)">+ 绑定登录态</el-button>
              </div>
              <div v-if="expandedLogin.has(String(address.id))" class="binding-body">
                <div v-if="loginStatesOf(address.id).length === 0" class="binding-empty">该地址暂无绑定登录态</div>
                <div v-else>
                  <div v-for="s in loginStatesOf(address.id)" :key="s.id" class="login-row">
                    <span class="login-name">{{ s.name }}</span>
                    <el-tag size="small" :type="loginStatusType(s.expireStatus)">{{ s.expireStatus }}</el-tag>
                    <span class="login-expire">{{ s.expireAt }}</span>
                    <div class="login-ops">
                      <el-button size="small" link @click="openEditLogin(s)">更新</el-button>
                      <el-button size="small" link type="danger" @click="deleteLogin(s)">删除</el-button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 推送 spt 绑定段 -->
            <div class="binding-section">
              <div class="binding-title" @click="toggleSpt(address.id)">
                <span>
                  <el-icon class="toggle-icon" :class="{ expanded: expandedSpt.has(String(address.id)) }">▶</el-icon>
                  推送 spt
                  <el-tag size="small" type="info" class="count-tag">{{ pushTargetsOf(address.id).length }}</el-tag>
                </span>
                <span>
                  <el-button size="small" link @click.stop="testPush(address.id)">测试推送</el-button>
                  <el-button size="small" @click.stop="openAddSpt(address.id)">+ 新增 spt</el-button>
                </span>
              </div>
              <div v-if="expandedSpt.has(String(address.id))" class="binding-body">
                <div v-if="pushTargetsOf(address.id).length === 0" class="binding-empty">
                  该地址暂无推送 spt，命中时将回退用户默认 spt
                </div>
                <div v-else>
                  <div v-for="t in pushTargetsOf(address.id)" :key="t.id" class="spt-row">
                    <span class="spt-value">{{ t.spt }}</span>
                    <span class="spt-remark">{{ t.remark }}</span>
                    <el-switch size="small" v-model="t.enabled" @change="toggleSptEnabled(t, address.id)" />
                    <el-button size="small" link @click="openEditSpt(t, address.id)">编辑</el-button>
                    <el-button size="small" link type="danger" @click="deleteSpt(t, address.id)">删除</el-button>
                  </div>
                </div>
              </div>
            </div>

            <div class="operation-buttons">
              <el-button
                class="delete-btn"
                @click="deleteAddress(address.id, index)"
                :disabled="loading"
              >
                删除地址
              </el-button>
            </div>
          </div>
        </el-card>
      </div>
    </el-card>

    <!-- Add address form -->
    <el-card
      v-if="isAdding"
      class="address-form-card mt-4"
    >
      <template #header>
        <div class="card-header">
          <span>新增地址</span>
          <el-button type="primary" link @click="cancelOperation"> 取消 </el-button>
        </div>
      </template>

      <el-form :model="form" ref="formRef" :rules="rules" label-width="100px" class="mt-4">
        <el-form-item label="所在地区" prop="region">
          <el-cascader
            v-model="form.region"
            :options="regionOptions"
            :props="regionProps"
            clearable
            placeholder="请选择省/市/区"
            @change="handleRegionChange"
            style="width: 100%"
          />
        </el-form-item>

        <el-form-item label="详细地址" prop="selectedAddress" v-if="form.cityCode">
          <el-autocomplete
            v-model="form.addressKeyword"
            :fetch-suggestions="queryAddress"
            placeholder="请输入详细地址"
            @select="handleAddressSelect"
            value-key="value"
            clearable
            style="width: 100%"
          >
            <template #default="{ item }">
              <div style="line-height: 1.5">
                <div style="font-weight: 500; color: #333">{{ item.title }}</div>
                <div style="font-size: 12px; color: #666; margin-top: 2px">
                  {{ item.address }}
                </div>
              </div>
            </template>
          </el-autocomplete>

          <div v-if="form.selectedAddress" class="selected-address">
            <p class="title">{{ form.selectedAddress.title }}</p>
            <p class="detail">{{ form.selectedAddress.address }}</p>
          </div>
        </el-form-item>



        <div class="form-actions">
          <el-button @click="cancelOperation" :disabled="loading">取消</el-button>
          <el-button type="primary" @click="submitForm" :loading="loading"> 确定 </el-button>
        </div>
      </el-form>
    </el-card>

    <!-- 新增/编辑登录态对话框 -->
    <el-dialog v-model="loginDialogVisible" :title="loginEditingId != null ? '更新登录态' : '新增登录态'" width="560px" align-center>
      <el-form label-width="90px">
        <el-form-item label="别名">
          <el-input v-model="loginForm.name" placeholder="如 主账号/小号" />
        </el-form-item>
        <el-form-item label="抓包header">
          <el-input v-model="loginForm.rawHeaders" type="textarea" :rows="10"
            placeholder="粘贴抓包 header（含 X-Sivir/X-Session-Id/X-Vayne/X-Teemo/X-Nami）或抓包 JSON" />
        </el-form-item>
        <div v-if="loginEditingId != null" class="hint">留空则保留原登录态，填写则覆盖（重新抓包后粘贴新值）。</div>
      </el-form>
      <template #footer>
        <el-button @click="loginDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="loginSaving" @click="saveLoginState">保存</el-button>
      </template>
    </el-dialog>

    <!-- 新增/编辑推送 spt 对话框 -->
    <el-dialog v-model="sptDialogVisible" :title="sptEditingId != null ? '编辑推送 spt' : '新增推送 spt'" width="500px" align-center>
      <el-form label-width="80px">
        <el-form-item label="spt" required>
          <el-input v-model="sptForm.spt" placeholder="WxPusher spt" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="sptForm.remark" placeholder="如 主微信/小号微信" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="sptForm.enabled" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="sptForm.sort" :min="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="sptDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="sptSaving" @click="saveSpt">保存</el-button>
      </template>
    </el-dialog>

  </div>
</template>

<style lang="scss" scoped>
// ============================================
// Card containers
// ============================================
.address-list-card,
.address-form-card {
  border-radius: 12px;
  border: none;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
}

// ============================================
// Card header
// ============================================
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;

  span {
    font-size: 16px;
    font-weight: 600;
    color: #333;
  }
}

// ============================================
// Grid layout
// ============================================
.address-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 20px;
}

// ============================================
// Card styles
// ============================================
.address-card {
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  border-radius: 12px;
  border: none;
  overflow: hidden;
  animation: fadeIn 0.5s ease forwards;

  &:hover {
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.08), 0 6px 6px rgba(0, 0, 0, 0.05);
    transform: translateY(-4px);
  }
}

.address-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  align-items: flex-start;
  margin-bottom: 12px;
}

.address-name {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  display: flex;
  align-items: center;
  gap: 8px;
}

.address-main {
  color: #666;
  line-height: 1.6;
  margin-bottom: 10px;
}

// ============================================
// Binding sections (登录态 / spt)
// ============================================
.binding-section {
  border-top: 1px dashed #ebeef5;
  margin-top: 10px;
  padding-top: 8px;
}

.binding-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: #606266;
  user-select: none;

  .toggle-icon {
    font-size: 10px;
    margin-right: 4px;
    transition: transform 0.2s;

    &.expanded {
      transform: rotate(90deg);
    }
  }

  .count-tag {
    margin-left: 6px;
  }
}

.binding-body {
  margin-top: 10px;
}

.binding-empty {
  font-size: 12px;
  color: #c0c4cc;
  padding: 6px 0;
}

.login-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 6px 0;
  border-bottom: 1px solid #f5f7fa;

  .login-name {
    font-size: 13px;
    color: #333;
    font-weight: 500;
  }

  .login-expire {
    font-size: 12px;
    color: #909399;
  }

  .login-ops {
    margin-left: auto;
    display: flex;
    gap: 4px;
  }
}

.spt-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid #f5f7fa;

  .spt-value {
    font-size: 12px;
    font-family: monospace;
    color: #333;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .spt-remark {
    font-size: 12px;
    color: #909399;
    flex: 1;
  }
}

.hint {
  color: #e6a23c;
  font-size: 12px;
}

// ============================================
// Buttons
// ============================================
.operation-buttons {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  align-items: center;
  margin-top: 15px;
}

.delete-btn {
  background-color: #fff2f0 !important;
  color: #ff4d4f !important;
  border-color: #ffccc7 !important;
  padding: 8px 20px !important;
  font-size: 14px !important;

  &:hover {
    background-color: #fff1f0 !important;
    transform: translateY(-2px);
  }
}

.add-address-btn {
  background-color: #87ceeb !important;
  color: #fff !important;
  border-color: #87ceeb !important;

  &:hover {
    background-color: #6bb6e6 !important;
    transform: translateY(-2px);
  }
}

// ============================================
// Empty state
// ============================================
.empty-state {
  text-align: center;
  padding: 40px 20px;
  background-color: #fff;
  border-radius: 8px;
  margin-top: 20px;
}

// ============================================
// Selected address preview
// ============================================
.selected-address {
  margin-top: 10px;
  padding: 12px 15px;
  background-color: #f5f7fa;
  border-radius: 6px;
  border-left: 3px solid #36b37e;

  .title {
    font-weight: 500;
    margin-bottom: 5px;
    color: #333;
  }

  .detail {
    font-size: 13px;
    color: #666;
  }
}

// ============================================
// Form actions
// ============================================
.form-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  margin-top: 20px;
  padding-top: 15px;
  border-top: 1px solid #f0f0f0;
}

// ============================================
// Utility
// ============================================
.mt-4 {
  margin-top: 16px;
}

// ============================================
// Responsive
// ============================================
@media screen and (max-width: 768px) {
  .address-list-card,
  .address-form-card {
    border-radius: 10px;

    :deep(.el-card__header) {
      padding: 14px 16px;
    }

    :deep(.el-card__body) {
      padding: 14px 16px;
    }
  }

  .card-header {
    span {
      font-size: 15px;
    }
  }

  .address-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .address-card {
    :deep(.el-card__body) {
      padding: 14px;
    }
  }

  .address-name {
    font-size: 15px;
  }

  .address-main {
    font-size: 13px;
    margin-bottom: 8px;
  }

  .operation-buttons {
    flex-direction: row;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 10px;

    .el-button {
      width: auto;
      min-width: 60px;
    }
  }

  // Form mobile adaptation
  :deep(.el-form) {
    .el-form-item {
      flex-direction: column;
      align-items: stretch;

      .el-form-item__label {
        text-align: left;
        padding-bottom: 4px;
        width: auto !important;
      }

      .el-form-item__content {
        margin-left: 0 !important;
      }
    }
  }

  .form-actions {
    flex-direction: column;
    gap: 8px;
    padding-top: 12px;

    .el-button {
      width: 100%;
    }
  }

  .selected-address {
    padding: 10px 12px;

    .title {
      font-size: 14px;
    }

    .detail {
      font-size: 12px;
    }
  }

  .empty-state {
    padding: 30px 16px;
  }
}

// ============================================
// Animations
// ============================================
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
