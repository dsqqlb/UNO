<template>
  <div :class="cardClass">
    <span class="corner">{{ text }}</span>{{ text }}<span class="corner br">{{ text }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { cardText, cardColorClass } from '../anim';

const props = defineProps({ card: { type: Object, required: true } });

const text = computed(() => cardText(props.card));
const cardClass = computed(() => `card ${cardColorClass(props.card)}`);
</script>
