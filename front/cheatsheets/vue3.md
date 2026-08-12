# Vue 3 速查

## 模板
```vue
<template>
  <div :class="cls" @click="fn">
    <h1>{{ title }}</h1>
    <p v-if="loading">Loading...</p>
    <ul v-else>
      <li v-for="i in items" :key="i.id">{{ i.name }}</li>
    </ul>
  </div>
</template>
```

## 指令
```vue
v-bind (:)
v-on (@)
v-if / v-else-if / v-else
v-for
v-show                <!-- display: none -->
v-model
v-once                <!-- 一次 -->
v-memo="[a, b]"       <!-- 缓存 -->
v-pre                 <!-- 不编译 -->
v-cloak               <!-- 防闪烁 -->
v-html="raw"          <!-- XSS 风险 -->

<!-- 自定义 v-model -->
<MyInput v-model="value" />
<MyInput v-model:title="t" v-model:body="b" />
```

## script setup
```vue
<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue';
import type { PropType } from 'vue';

const props = defineProps<{
  msg: string;
  count?: number;
}>();

const emit = defineEmits<{
  (e: 'change', v: string): void;
  (e: 'submit'): void;
}>();

const count = ref(0);
const state = reactive({ user: { name: 'A' } });

const double = computed(() => count.value * 2);
watch(() => state.user.name, v => console.log(v));
watchEffect(() => console.log(count.value));

onMounted(() => console.log('mounted'));
</script>
```

## 响应式 API
```typescript
ref<T>(value)          // .value, 模板自动解包
reactive(obj)          // Proxy 对象
shallowRef(v)          // 仅 .value 响应
shallowReactive(obj)   // 仅顶层响应
readonly(obj)          // 只读
markRaw(obj)           // 标记不响应

const r = ref(0); r.value;
const obj = reactive({}); obj.x = 1;
```

## 计算/监听
```typescript
const c = computed(() => a.value + b.value);
const c = computed({ get: () => x, set: v => x = v });

watch(source, (newV, oldV) => {}, { immediate, deep, flush });
watchEffect(fn);   // 自动收集依赖
const stop = watchEffect(fn); stop();

// 多个源
watch([a, b, () => c.value], ([a, b, c]) => {});
```

## 生命周期
```typescript
onBeforeMount
onMounted
onBeforeUpdate
onUpdated
onBeforeUnmount
onUnmounted
onErrorCaptured        // 错误捕获
onActivated            // <keep-alive>
onDeactivated
onRenderTracked        // 调试
onRenderTriggered      // 调试
```

## 组件
```typescript
// 异步
const Heavy = defineAsyncComponent(() => import('./Heavy.vue'));

// Teleport
<Teleport to="body">
  <Modal />
</Teleport>

// Suspense
<Suspense>
  <AsyncComponent />
  <template #fallback>Loading...</template>
</Suspense>

// Fragment (默认支持多个根)

// KeepAlive
<KeepAlive include="Foo">
  <component :is="currentTab" />
</KeepAlive>
```

## 插槽
```vue
<!-- 父 -->
<Card>
  <template #header>Title</template>
  <p>Default</p>
  <template #footer="{ close }">
    <button @click="close">Close</button>
  </template>
</Card>

<!-- 子 -->
<template>
  <header v-if="$slots.header"><slot name="header" /></header>
  <main><slot /></main>
  <footer>
    <slot name="footer" :close="close" />
  </footer>
</template>
```

## provide / inject
```vue
<!-- 父 -->
<script setup>
import { provide, ref } from 'vue';
const theme = ref('light');
provide('theme', theme);
provide('toggle', () => theme.value = theme.value === 'light' ? 'dark' : 'light');
</script>

<!-- 子 -->
<script setup>
import { inject } from 'vue';
const theme = inject('theme');
const toggle = inject('toggle');
</script>
```

## Pinia
```typescript
// store
import { defineStore } from 'pinia';

export const useCounter = defineStore('counter', () => {
  const count = ref(0);
  const double = computed(() => count.value * 2);
  const inc = () => count.value++;
  return { count, double, inc };
});

// 使用
import { storeToRefs } from 'pinia';
const counter = useCounter();
const { count, double } = storeToRefs(counter);
const { inc } = counter;
```

## Router
```typescript
import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./Home.vue') },
    { path: '/user/:id', component: User, props: true },
    { path: '/:pathMatch(.*)*', component: NotFound },
  ],
});

router.beforeEach((to) => {
  if (to.meta.requiresAuth && !isLoggedIn()) return '/login';
});

// 组件内
import { useRoute, useRouter } from 'vue-router';
const route = useRoute();
const router = useRouter();
router.push('/');
```

## 性能
```vue
<!-- 缓存 -->
<div v-once>{{ staticData }}</div>
<div v-memo="[a, b]">{{ heavy }}</div>

<!-- 大数据 -->
<script setup>
import { shallowRef, triggerRef } from 'vue';
const big = shallowRef([]);
big.value = await fetchAll();
</script>
```

## 模板 ref
```vue
<script setup>
import { ref, useTemplateRef } from 'vue';
const input = useTemplateRef('input');
onMounted(() => input.value?.focus());
</script>
<template>
  <input ref="input" />
</template>
```

## TypeScript
```typescript
// 响应式 ref 类型
const r: Ref<number> = ref(0);
const inputEl: Ref<HTMLInputElement | null> = ref(null);

// 模板 ref
const input = useTemplateRef('input');  // 自动推断

// props 默认值 (3.5+)
const { msg, count = 0 } = defineProps<{
  msg: string;
  count?: number;
}>();
```