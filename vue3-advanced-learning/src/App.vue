<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import { useAppStore } from '@stores/app';
import { useI18n } from './plugins/i18n';

const route = useRoute();
const appStore = useAppStore();
const i18n = useI18n();

const sidebarOpen = ref(true);
const navItems = computed(() => appStore.navItems);
const currentPath = computed(() => route.path);

function toggleSidebar(): void {
  sidebarOpen.value = !sidebarOpen.value;
}
</script>

<template>
  <div class="app-layout">
    <aside
      class="sidebar"
      :class="{ collapsed: !sidebarOpen }"
    >
      <header class="sidebar-header">
        <h1
          v-if="sidebarOpen"
          class="logo"
        >
          Vue 3 高级
        </h1>
        <button
          class="toggle-btn"
          @click="toggleSidebar"
        >
          {{ sidebarOpen ? '◀' : '▶' }}
        </button>
      </header>
      <nav class="sidebar-nav">
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          :class="{ active: currentPath === item.path }"
        >
          <span class="icon">{{ item.icon }}</span>
          <span
            v-if="sidebarOpen"
            class="label"
          >{{ item.title }}</span>
        </RouterLink>
      </nav>
    </aside>

    <main class="main-content">
      <div class="topbar">
        <h2>{{ i18n.t('welcome') }}</h2>
        <span class="badge">v3.4</span>
      </div>
      <div class="page-container">
        <RouterView v-slot="{ Component }">
          <Transition
            name="fade"
            mode="out-in"
          >
            <KeepAlive>
              <component :is="Component" />
            </KeepAlive>
          </Transition>
        </RouterView>
      </div>
    </main>
  </div>
</template>

<style lang="scss" scoped>
.app-layout {
  display: flex;
  min-height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.sidebar {
  width: 240px;
  background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
  color: #fff;
  transition: width 0.3s ease;
  display: flex;
  flex-direction: column;

  &.collapsed {
    width: 64px;
  }

  &-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .logo {
    margin: 0;
    font-size: 1.2rem;
    background: linear-gradient(135deg, #42b883 0%, #35495e 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .toggle-btn {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #fff;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
    }
  }
}

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 0;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 1rem;
  color: rgba(255, 255, 255, 0.7);
  text-decoration: none;
  transition: all 0.2s;
  border-left: 3px solid transparent;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #fff;
  }

  &.active {
    background: rgba(66, 184, 131, 0.15);
    color: #42b883;
    border-left-color: #42b883;
  }

  .icon {
    font-size: 1.1rem;
    width: 1.5rem;
    text-align: center;
  }
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 2rem;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);

  h2 {
    margin: 0;
    color: #2c3e50;
  }

  .badge {
    background: linear-gradient(135deg, #42b883, #35495e);
    color: #fff;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.85rem;
    font-weight: 600;
  }
}

.page-container {
  flex: 1;
  padding: 2rem;
  overflow-y: auto;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
