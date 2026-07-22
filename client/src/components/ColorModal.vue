<template>
  <div class="modal">
    <div class="modal-box">
      <h3>选择一个颜色</h3>
      <div class="color-choices">
        <button
          v-for="c in colors"
          :key="c.key"
          class="color-btn"
          :style="{ background: c.value }"
          @click="$emit('pick', c.key)"
        ></button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineEmits(['pick']);

const colors = [
  { key: 'red', value: '#e4392f' },
  { key: 'yellow', value: '#f2c400' },
  { key: 'green', value: '#3aa544' },
  { key: 'blue', value: '#2879c0' },
];
</script>
