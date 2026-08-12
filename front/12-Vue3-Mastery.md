# 12 · Vue3 精通

> Vue3 是一个**渐进式响应式框架**。它的核心创新是 Proxy 响应式 + 编译时优化。精通 Vue3 = 理解响应式原理 + 组合式 API 设计 + 编译优化。

## 📌 心智模型

```
Vue3 的核心:
  • 响应式系统 (Proxy + 依赖收集)
  • 编译时优化 (PatchFlag、Block Tree)
  • 组合式 API (Composition API)
  • 多端适配 (Web、SSR、移动)
  • 自定义渲染器 (DOM、WebGL、Canvas)

版本: 3.4+ 响应式重写为基于 Proxy 深响应
```

## 12.1 模板语法

### 12.1.1 基础
```vue
<template>
  <div :class="cls" @click="handle">
    <h1>{{ title }}</h1>
    <p v-if="loading">Loading...</p>
    <ul v-else>
      <li v-for="item in items" :key="item.id">
        {{ item.name }}
      </li>
    </ul>
  </div>
</template>
```

### 12.1.2 指令
```vue
<!-- v-bind -->
<img :src="url" :alt="alt">

<!-- v-on -->
<button @click="onClick($event)">Click</button>
<input @keyup.enter="submit">

<!-- v-model -->
<input v-model="text">
<input v-model.lazy="text">    <!-- 失焦触发 -->
<input v-model.number="num">
<input v-model.trim="text">

<!-- 自定义 v-model (组件) -->
<!-- 父 -->
<CustomInput v-model="value" />
<!-- 子 -->
<input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)">

<!-- 多个 v-model -->
<UserForm v-model:name="name" v-model:age="age" />

<!-- v-show vs v-if -->
<div v-show="ok">渲染但隐藏(display:none)</div>
<div v-if="ok">条件渲染</div>

<!-- v-memo (缓存子树) -->
<div v-memo="[valueA, valueB]">...</div>
```

### 12.1.3 插槽
```vue
<!-- 父 -->
<Card>
  <template #header>
    <h3>Title</h3>
  </template>
  <p>Content</p>
  <template #footer="{ close }">
    <button @click="close">Close</button>
  </template>
</Card>

<!-- 子 -->
<template>
  <div class="card">
    <header v-if="$slots.header"><slot name="header" /></header>
    <main><slot /></main>
    <footer v-if="$slots.footer">
      <slot name="footer" :close="handleClose" />
    </footer>
  </div>
</template>
```

## 12.2 响应式系统原理

### 12.2.1 ref / reactive
```typescript
import { ref, reactive, shallowRef, shallowReactive } from 'vue';

// ref: 基本类型 + 引用类型都包成 .value
const count = ref(0);
count.value++;
// 在模板中自动解包: {{ count }}

// reactive: 仅对象
const state = reactive({ user: { name: 'A' } });
state.user.name = 'B';

// shallow: 仅顶层响应,性能好
const bigList = shallowRef([]);
bigList.value = await fetchBigList();  // 替换 OK,内部不动
```

### 12.2.2 computed
```typescript
import { computed } from 'vue';

const count = ref(0);
const double = computed(() => count.value * 2);
const plusOne = computed({
  get: () => count.value + 1,
  set: (v) => { count.value = v - 1; },
});
```

### 12.2.3 watch / watchEffect
```typescript
import { watch, watchEffect } from 'vue';

// watch: 显式源
const count = ref(0);
watch(count, (newVal, oldVal) => console.log(newVal, oldVal));
watch(() => state.user.name, (v) => /* ... */);

// 多个源
watch([a, b, () => c.value], ([a, b, c]) => /* ... */);

// deep watch (慎用,性能差)
watch(state, (v) => { /* ... */ }, { deep: true });

// watchEffect: 自动收集依赖
const stop = watchEffect(() => {
  console.log(count.value, state.user.name);
});
stop();  // 停止
```

### 12.2.4 响应式原理深入

```javascript
// 简化版响应式实现
let activeEffect;
const targetMap = new WeakMap();

function track(target, key) {
  if (!activeEffect) return;
  let depsMap = targetMap.get(target);
  if (!depsMap) targetMap.set(target, (depsMap = new Map()));
  let dep = depsMap.get(key);
  if (!dep) depsMap.set(key, (dep = new Set()));
  dep.add(activeEffect);
}

function trigger(target, key) {
  const depsMap = targetMap.get(target);
  if (!depsMap) return;
  const effects = depsMap.get(key);
  effects?.forEach(effect => effect());
}

function reactive(obj) {
  return new Proxy(obj, {
    get(target, key, receiver) {
      track(target, key);
      return Reflect.get(target, key, receiver);
    },
    set(target, key, value, receiver) {
      const oldValue = target[key];
      const result = Reflect.set(target, key, value, receiver);
      if (oldValue !== value) trigger(target, key);
      return result;
    }
  });
}

function effect(fn) {
  activeEffect = fn;
  fn();
  activeEffect = null;
}
```

## 12.3 组合式 API 模式

### 12.3.1 <script setup>
```vue
<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import type { PropType } from 'vue';

interface User {
  id: number;
  name: string;
}

const props = defineProps<{
  userId: number;
  showDetails?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select', user: User): void;
  (e: 'close'): void;
}>();

const user = ref<User | null>(null);
const fullName = computed(() => `${user.value?.firstName} ${user.value?.lastName}`);

watch(() => props.userId, async (id) => {
  user.value = await fetchUser(id);
}, { immediate: true });

onMounted(() => console.log('mounted'));
</script>

<template>
  <div @click="emit('select', user!)">
    {{ fullName }}
  </div>
</template>
```

### 12.3.2 useXxx 模式
```typescript
// composables/useLocalStorage.ts
import { ref, watch } from 'vue';

export function useLocalStorage<T>(key: string, initial: T) {
  const value = ref<T>(initial);

  // SSR 安全
  if (typeof window !== 'undefined') {
    try {
      const item = localStorage.getItem(key);
      if (item) value.value = JSON.parse(item);
    } catch {}

    watch(value, (v) => {
      localStorage.setItem(key, JSON.stringify(v));
    }, { deep: true });
  }

  return value;
}
```

```typescript
// composables/useFetch.ts
import { ref, watchEffect } from 'vue';

export function useFetch<T>(url: string | (() => string)) {
  const data = ref<T | null>(null);
  const error = ref<Error | null>(null);
  const loading = ref(true);

  watchEffect(async () => {
    loading.value = true;
    try {
      const u = typeof url === 'function' ? url() : url;
      const res = await fetch(u);
      data.value = await res.json();
    } catch (e) {
      error.value = e as Error;
    } finally {
      loading.value = false;
    }
  });

  return { data, error, loading };
}
```

## 12.4 组件设计

### 12.4.1 受控/非受控
```vue
<!-- 受控 -->
<MyInput :value="text" @update:value="(v) => text = v" />

<!-- 非受控 + 默认值 -->
<MyInput :default-value="text" @change="onChange" />
```

### 12.4.2 Provide / Inject
```vue
<!-- 父 -->
<script setup>
import { provide, ref } from 'vue';
const theme = ref('dark');
provide('theme', theme);
provide('updateTheme', (v: string) => theme.value = v);
</script>

<!-- 子(任意深) -->
<script setup>
import { inject, type Ref } from 'vue';
const theme = inject<Ref<string>>('theme');
const update = inject<(v: string) => void>('updateTheme');
</script>
```

### 12.4.3 异步组件
```vue
<script setup>
import { defineAsyncComponent } from 'vue';
const HeavyChart = defineAsyncComponent({
  loader: () => import('./HeavyChart.vue'),
  loadingComponent: LoadingSkeleton,
  errorComponent: ErrorComp,
  delay: 200,
});
</script>
```

### 12.4.4 递归组件
```vue
<!-- TreeItem.vue -->
<template>
  <li>
    {{ item.name }}
    <ul v-if="item.children">
      <TreeItem
        v-for="child in item.children"
        :key="child.id"
        :item="child"
      />
    </ul>
  </li>
</template>

<script setup>
defineProps<{ item: TreeNode }>();
</script>
```

## 12.5 Pinia (状态管理)

### 12.5.1 Store 定义
```typescript
// stores/user.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null);
  const isLoggedIn = computed(() => !!user.value);

  async function login(credentials: Credentials) {
    user.value = await api.login(credentials);
  }

  function logout() {
    user.value = null;
  }

  return { user, isLoggedIn, login, logout };
});
```

### 12.5.2 选项式风格
```typescript
export const useCounterStore = defineStore('counter', {
  state: () => ({ count: 0 }),
  getters: {
    double: (state) => state.count * 2,
  },
  actions: {
    inc() { this.count++; },
  },
});
```

### 12.5.3 在组件中使用
```vue
<script setup>
import { storeToRefs } from 'pinia';
import { useUserStore } from '@/stores/user';

const userStore = useUserStore();
const { user, isLoggedIn } = storeToRefs(userStore);  // 解构保持响应
const { login, logout } = userStore;  // 方法可直接解构
</script>
```

### 12.5.4 插件
```typescript
// 持久化
import { createPinia } from 'pinia';
import piniaPersist from 'pinia-plugin-persistedstate';

const pinia = createPinia();
pinia.use(piniaPersist);
```

## 12.6 路由 (Vue Router)

### 12.6.1 配置
```typescript
import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('@/pages/Home.vue') },
    {
      path: '/user/:id',
      component: () => import('@/pages/User.vue'),
      props: true,
      beforeEnter: (to) => {
        if (!isLoggedIn()) return { name: 'login', query: { redirect: to.fullPath } };
      },
    },
    { path: '/:pathMatch(.*)*', component: NotFound },
  ],
});

router.beforeEach((to, from) => {
  // 全局守卫
});
```

### 12.6.2 路由元信息
```typescript
{ path: '/admin', meta: { requiresAuth: true, roles: ['admin'] } }

router.beforeEach((to) => {
  if (to.meta.requiresAuth && !isLoggedIn()) return '/login';
});
```

### 12.6.3 Composition API 路由
```vue
<script setup>
import { useRoute, useRouter } from 'vue-router';
const route = useRoute();
const router = useRouter();
const id = computed(() => route.params.id as string);
</script>
```

## 12.7 性能优化

### 12.7.1 v-once / v-memo
```vue
<!-- 仅渲染一次 -->
<div v-once>{{ staticData }}</div>

<!-- 缓存子树 -->
<div v-memo="[user.id, user.score]">
  <HeavyComponent :user="user" />
</div>
```

### 12.7.2 shallowRef / shallowReactive
```typescript
// 大数据,不需要深度响应
const bigList = shallowRef([]);
bigList.value = await fetchAll();
```

### 12.7.3 markRaw
```typescript
import { markRaw } from 'vue';
// 标记为非响应式(第三方实例、组件)
const chart = markRaw(new Chart());
```

### 12.7.4 计算属性替代 watch
```typescript
// ❌ 派生用 watch
watch([a, b], () => { c.value = a + b; });

// ✅ 用 computed
const c = computed(() => a.value + b.value);
```

### 12.7.5 列表性能
```vue
<!-- 稳定 key -->
<item v-for="x in list" :key="x.id" />

<!-- 大量静态内容 v-once -->
<heavy-component v-once :data="hugeData" />
```

### 12.7.6 异步组件 + 路由分割
```typescript
const routes = [
  { path: '/', component: () => import('./Home.vue') },
  // 自动按需加载
];
```

### 12.7.7 Vue DevTools
- Components 树
- Pinia 状态
- Routes
- Performance 录制

## 12.8 测试

### 12.8.1 Vitest + Vue Test Utils
```typescript
import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import Counter from './Counter.vue';

describe('Counter', () => {
  it('increments on click', async () => {
    const wrapper = mount(Counter);
    await wrapper.find('button').trigger('click');
    expect(wrapper.text()).toContain('1');
  });
});
```

### 12.8.2 组件契约
```typescript
import { mount } from '@vue/test-utils';
it('matches snapshot', () => {
  expect(mount(Button, { props: { variant: 'primary' } }).html()).toMatchSnapshot();
});
```

## 12.9 服务端渲染 (Nuxt 3)

### 12.9.1 文件路由
```vue
<!-- pages/user/[id].vue -->
<template>
  <div>User {{ id }}</div>
</template>

<script setup>
const route = useRoute();
const id = route.params.id;

const { data } = await useFetch(`/api/users/${id}`);
</script>
```

### 12.9.2 useFetch / useAsyncData
```typescript
// SSR 友好的数据获取
const { data, error } = await useFetch('/api/users', {
  key: 'users',
  transform: (res) => res.users,
  default: () => [],
});
```

### 12.9.3 Nitro (服务端)
```typescript
// server/api/users.ts
export default defineEventHandler(async () => {
  return await db.users.findMany();
});
```

## 12.10 动画

### 12.10.1 Transition
```vue
<Transition name="fade">
  <div v-if="show">Hello</div>
</Transition>

<style>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
```

### 12.10.2 TransitionGroup
```vue
<TransitionGroup name="list">
  <li v-for="item in items" :key="item.id">{{ item.name }}</li>
</TransitionGroup>
```

### 12.10.3 @vueuse/motion
```vue
<script setup>
import { vMotion } from '@vueuse/motion';
</script>
<template>
  <div v-motion="{ initial: { opacity: 0, y: 20 }, enter: { opacity: 1, y: 0 } }">
    Content
  </div>
</template>
```

## 12.11 TypeScript 与 Vue

### 12.11.1 defineProps 类型
```typescript
const props = defineProps<{
  msg: string;
  count?: number;
}>();

// 带默认值(响应式解构 3.5+)
const { msg, count = 0 } = defineProps<{
  msg: string;
  count?: number;
}>();
```

### 12.11.2 defineEmits
```typescript
const emit = defineEmits<{
  change: [value: string];
  submit: [];
}>();
```

### 12.11.3 ref 类型
```typescript
import { ref, type Ref } from 'vue';

const inputEl: Ref<HTMLInputElement | null> = ref(null);
```

### 12.11.4 模板 ref
```vue
<script setup>
const inputEl = useTemplateRef('input');
onMounted(() => inputEl.value?.focus());
</script>
<template>
  <input ref="input" />
</template>
```

## 12.12 专家陷阱清单

| 陷阱 | 后果 | 解决 |
|------|------|------|
| reactive 解构 | 失去响应 | 用 toRefs |
| 大对象 deep watch | 性能差 | 用 shallowRef |
| ref 自动解包失效 | 模板中 .value 错 | ref 包对象即可 |
| 计算属性内副作用 | 难调试 | 改 watch |
| v-for 用 index | 错乱 | 用稳定 key |
| 直接改 reactive 对象 | 不会更新 | 用新对象 |
| 异步组件无错误处理 | 卡 loading | 配 errorComponent |
| 路由懒加载但 webpack 配错 | 全部打包 | 检查 chunkFilename |
| 自定义指令没卸载钩子 | 内存泄漏 | unmounted 钩子 |
| 全局组件没按需注册 | 体积大 | 用 unplugin-vue-components |

## 12.13 实战项目

### 🎯 项目 1: 完整电商 SPA (Vue3 + TS + Pinia + Vue Router + Element Plus)
要求:
- 路由懒加载
- 商品列表/详情/购物车/订单
- 数据持久化
- SSR (Nuxt)
- 单元测试
- Storybook

### 🎯 项目 2: 可视化大屏
要求:
- 数据大屏布局
- ECharts 集成
- 实时数据更新
- 全屏 / 主题切换
- 适配不同分辨率

### 🎯 项目 3: 内容管理后台
要求:
- 权限路由
- 动态菜单
- 表单生成器
- 列表查询器
- 暗色主题

## ✅ 本章检查清单

- [ ] 响应式原理(Proxy + track/trigger)能讲清
- [ ] ref/reactive/computed/watch 区分清楚
- [ ] <script setup> 熟练
- [ ] 自定义 composable 写得出
- [ ] Pinia store 设计
- [ ] Vue Router 配置 + 守卫
- [ ] 性能优化(v-once/v-memo/shallowRef)用过
- [ ] 完成 3 个实战项目

**下一章:** → [13-Testing-and-Quality.md](./13-Testing-and-Quality.md)