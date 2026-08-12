<script setup>
const specialCards = [
  { card: 'Q♠', name: '猪', score: '-100', note: '亮猪后效果翻倍' },
  { card: 'J♦', name: '羊', score: '+100', note: '亮羊后效果翻倍' },
  { card: 'A♥', name: '红', score: '红桃', note: '亮红后红桃效果翻倍' },
  { card: '10♣', name: '变', score: '+50 / ×2', note: '单独收得加分；亮变后 ×4' }
];
</script>

<template>
  <section class="gongzhu-rules-panel">
    <div class="gongzhu-special-grid">
      <article v-for="item in specialCards" :key="item.name">
        <b>{{ item.card }}</b><div><strong>{{ item.name }} · {{ item.score }}</strong><span>{{ item.note }}</span></div>
      </article>
    </div>
    <div class="gongzhu-rule-copy">
      <article><strong>亮牌</strong><p>发牌后秘密选择自己持有的猪、羊、红、变；四人全部提交后同时公开。亮过的牌在该花色第一次领出时受保护，手里只剩这一张时例外。</p></article>
      <article><strong>出牌</strong><p>第一副由梅花 2 持有者首出且必须出梅花 2；之后由上一副收猪者首出。必须跟随首出花色，无该花色时可以垫任意合法牌。</p></article>
      <article><strong>计分</strong><p>猪 -100、羊 +100；红桃按点数计负分，收齐十三张红桃改为 +200（亮红时 +400）。变单独收得 +50，否则令本副得分 ×2；亮变分别改为 +100 或 ×4。收齐全部计分牌为满贯，未亮牌时基础 +800，亮牌按实际倍数继续计算。</p></article>
      <article><strong>胜负</strong><p>每副原始分直接累计。任一玩家总分不高于 -1000 后触发结算，最高总分唯一者获胜；最高分并列则继续加赛。</p></article>
    </div>
  </section>
</template>
