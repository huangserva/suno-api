# Suno Style Recipes

This document stores reusable Suno style recipes for this fork. It is meant for Codex and other local agents, so avoid machine-specific paths and never include secrets.

## Recipe: 差一点

Use this recipe when the target is emotional Mandarin rock with cinematic MV energy: bittersweet, determined, human, and explosive in the chorus.

### What Worked

The strongest result came from a reference-audio workflow:

- `reference_type`: `cover`
- `audio_weight`: `80`
- model: `chirp-fenix`
- title: `差一点 新版`
- result project: `black-bear-chayidian-reference`

Suno analyzed the reference as:

```text
Mandopop rock track in G major at 145 BPM. The arrangement features a driving rhythm section with a bright, overdriven electric guitar playing syncopated power chords and melodic lead lines. A clean acoustic guitar provides rhythmic strumming in the background. The bass guitar follows the kick drum pattern with a thick, rounded tone. Male vocals are delivered with a powerful, slightly raspy chest voice, transitioning into a soaring belt during the chorus. The drums utilize a standard rock kit with a prominent snare crack and consistent eighth-note hi-hat patterns. An instrumental bridge features a melodic electric guitar solo with moderate sustain and vibrato.
```

Use that analysis as the style anchor when reference upload is unavailable.

### Style Prompt

```text
Mandopop rock track in G major at 145 BPM, driving rhythm section, bright overdriven electric guitar with syncopated power chords and melodic lead lines, clean acoustic guitar rhythmic strumming, thick rounded bass following the kick drum, powerful slightly raspy Mandarin male chest voice, soaring belted chorus, prominent snare crack, consistent eighth-note hi-hats, melodic electric guitar solo with sustain and vibrato, bittersweet but uplifting, cinematic MV-ready, emotional Chinese rock storytelling, real band feel, memorable chorus
```

### Negative Prompt

```text
corporate anthem, generic inspirational pop, cheesy slogan song, bland ballad, worship music, children song, lo-fi, demo, muffled vocal, harsh treble, overcompressed, robotic vocal, off-key, weak drums, karaoke backing track, plastic synth pop, long ambient intro
```

### Lyric Shape

Use a small-person emotional story, not slogan writing.

Good ingredients:

- regret: `差一点`, `没说出口`, `差点转身离开`
- self-rescue: `把梦重新点亮`, `再往前一点`
- concrete scenes: city lights, old roads, rain, station platform, wind, crowd, guitar
- chorus with a repeated hook and rising emotional pressure
- bridge that gives one sharp image before the final chorus

Avoid:

- corporate wording like `点亮全世界`, `我们的骄傲`, `向梦奔跑`
- too many abstract motivational nouns
- generic upbeat pop-rock labels without the band details

### Reusable Lyrics Template

```text
[Verse 1]
城市的灯慢慢暗下来
我把没说出口的话藏进口袋
风从旧路吹过来
差一点 我就转身离开

[Pre-Chorus]
可心里还有一束光
在黑夜边缘发烫
像你曾经看着我
说别怕 别投降

[Chorus]
差一点就错过天亮
差一点就忘了方向
我在风里把名字唱到沙哑
还想再靠近一点啊
差一点就失去锋芒
差一点就认了荒凉
可我偏要穿过人海和山岗
把梦重新点亮

[Verse 2]
后来雨落在窗台
把沉默洗成一片海
我听见远处的节拍
像命运还在等我回来

[Bridge]
如果只剩最后一秒钟
我也要向前冲
让所有差一点的遗憾
变成新的风

[Final Chorus]
差一点就错过天亮
差一点就忘了方向
我在风里把名字唱到沙哑
还想再靠近一点啊
差一点就失去锋芒
差一点就认了荒凉
可我偏要穿过人海和山岗
把梦重新点亮
```

### More Uplifting Variant

Use this when the request asks for happier or more encouraging music, but keep the same emotional rock backbone.

```text
[Verse 1]
我把清晨装进口袋
把昨晚的雨留在站台
人群推着我往前走
心里有火还没烧开

路灯一盏一盏醒来
像给沉默排成了海
我听见胸口的节拍
说别停 别停 再来

[Pre-Chorus]
不是天生就勇敢
是摔过以后还不散
风越大我越想喊
让我再亮一点

[Chorus]
再往前一点 再大声一点
把黑夜唱到退后半边
就算世界还没看见
我也先把自己点燃
再往前一点 再靠近明天
让心跳撞开所有阴天
差一点也没关系
我会笑着冲过终点

[Verse 2]
鞋底踩碎旧时间
汗水发烫像一枚闪电
朋友在远处挥着手
喊我的名字穿过街

[Bridge]
如果命运转过脸
我就追到它面前
用一把旧吉他
弹醒整个夏天

[Final Chorus]
再往前一点 再大声一点
把黑夜唱到退后半边
就算世界还没看见
我也先把自己点燃
再往前一点 再靠近明天
让心跳撞开所有阴天
差一点也没关系
我会笑着冲过终点
```

### API Request

Start the API as described in [codex-suno-workflow.md](codex-suno-workflow.md), then:

```bash
curl -X POST "$BASE_URL/api/mv/generate_music" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $KEY" \
  -d '{
    "mv_project_id": "mv-chayidian-style",
    "title": "再往前一点",
    "lyrics": "[Verse 1]\n我把清晨装进口袋\n把昨晚的雨留在站台\n人群推着我往前走\n心里有火还没烧开\n\n[Pre-Chorus]\n不是天生就勇敢\n是摔过以后还不散\n风越大我越想喊\n让我再亮一点\n\n[Chorus]\n再往前一点 再大声一点\n把黑夜唱到退后半边\n就算世界还没看见\n我也先把自己点燃\n再往前一点 再靠近明天\n让心跳撞开所有阴天\n差一点也没关系\n我会笑着冲过终点",
    "style": "Mandopop rock track in G major at 145 BPM, driving rhythm section, bright overdriven electric guitar with syncopated power chords and melodic lead lines, clean acoustic guitar rhythmic strumming, thick rounded bass following the kick drum, powerful slightly raspy Mandarin male chest voice, soaring belted chorus, prominent snare crack, consistent eighth-note hi-hats, melodic electric guitar solo with sustain and vibrato, bittersweet but uplifting, cinematic MV-ready, emotional Chinese rock storytelling, real band feel, memorable chorus",
    "negative_tags": "corporate anthem, generic inspirational pop, cheesy slogan song, bland ballad, worship music, children song, lo-fi, demo, muffled vocal, harsh treble, overcompressed, robotic vocal, off-key, weak drums, karaoke backing track, plastic synth pop, long ambient intro",
    "include_aligned_lyrics": false
  }'
```

If Suno returns human verification, use the Suno web UI with the same title, lyrics, style prompt, and negative prompt, then import the completed result:

```bash
curl -X POST "$BASE_URL/api/mv/import_latest" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $KEY" \
  -d '{
    "mv_project_id": "mv-chayidian-style",
    "limit": 2,
    "ready_only": true
  }'
```

### Reference-Audio Route

If a valid self-owned reference audio is available and Suno does not block it, prefer:

```json
{
  "reference_type": "cover",
  "audio_weight": 80
}
```

If Suno returns `Uploaded audio matches existing work of art.`, stop using that file as reference. Do not try to bypass the block. Use the style prompt above or generate in the normal Suno web UI and import the result.

### Why Some Prompts Failed

The failed `向光出发` direction used broad words like `uplifting`, `bright`, `joyful`, `inspiring`, and `anthem`. Suno interpreted that as generic corporate pop rock. The better recipe uses concrete musical traits and an emotional narrative:

- exact tempo and key feel
- guitar/bass/drum behavior
- raspy male vocal delivery
- chorus shape
- specific visual lyric images

For this style, "励志" should come from surviving pain and moving forward, not from slogans.
