# Calendar 项目工程经验总结

来源：`updates.md`  
项目：AI0506 Calendar  
目标：从 Calendar 长期演化过程中真实出现的问题、返工、迁移和事故中，提炼可复用的工程经验。

## 这份文件和别的文件怎么分工

三份文件记的是同一批事故的三个层次，**不要互相复述**：

| 文件 | 记什么 | 写给谁 |
|---|---|---|
| `updates.md` | 这次改了什么、为什么、验证了什么 | 想知道某个改动来龙去脉的人 |
| `CLAUDE.md` / `AGENTS.md` | 在**这个仓库**干活时必须遵守的具体做法 | 下一个动这段代码的人 |
| `lessons.md`（本文件） | 抽象成可以带去**别的项目**的通用原则 | 以后做别的项目的自己 |

新踩的坑先进 `CLAUDE.md` / `AGENTS.md` 的开发规则——那里要求具体、可执行。
等它出现第二次、或者明显不只是这个项目的问题，再抽象成一条进这里。
只发生过一次且高度依赖本项目细节的，留在 `CLAUDE.md` 就够了。

iPad 客户端 `Reminders` 有一份同名同结构的 `lessons.md`，两边各记各的项目；
跨仓库的改动如果暴露了通用问题，两边各自判断要不要追加，不要把同一条抄两遍。

---

# Frontend / UX

## 1. UI 稳定性不仅是美观问题，而是交互正确性的一部分

**Area**

- Frontend
- UX
- State

**Problem Type**

- Layout Stability
- Interaction Drift

### Incident

Calendar 很早就反复碰到布局变化导致的体验问题：

- 切换日期时重建整个月视图造成明显 jank；
- All-day 开关直接隐藏时间字段，让 Modal 高度跳动；
- 校验错误使用 `display:none`，错误出现时再次推动整个 Modal；
- Preview / Timeline 因不同层级承担滚动，切换时滚动条出现/消失，使 header 横向移动；
- 后来的 Courses、Due Soon、Agenda 等区域也开始采用定高槽位，确保数据量变化时下面的筛选器不跟着移动。 
### Lesson

“内容没有丢失”不代表 UI 正确。

如果一个按钮、筛选器或操作目标会在用户点击前后移动，它实际上已经影响了操作可靠性。

### Rule

> 动态内容优先在稳定容器内部变化。能通过固定槽位、内部滚动、opacity 和局部 class 更新解决的问题，不要通过插入/删除整个布局节点解决。

---

## 2. 高成本视觉效果可能比业务逻辑更影响性能

**Area**

- Frontend
- Performance
- Visual Design

**Problem Type**

- GPU / Rendering Cost
- Perceived Performance

### Incident

New Event Modal 曾使用全屏 `backdrop-filter` blur。

点击分类色块时，看起来只是改一个小状态，但浏览器实际上要在动画和 repaint 中不断重新模糊背后的 42 格月视图，产生明显延迟。

后来 Apple Preview 再次遇到同样问题：弹簧动画每帧叠加大面积 blur，成为弹窗严重卡顿的根因。最终只在少量固定区域保留材质，其余改用实体背景、边框和阴影。 
### Lesson

“GPU 效果”不等于“几乎免费”。

特别是 blur、filter、shadow 与动画组合时，视觉层可能比 JavaScript 本身贵得多。

### Rule

> 动画卡顿时同时检查 DOM、layout 和 compositing。不要默认性能问题来自业务代码。

---

## 3. DOM 性能优化的核心是减少无意义工作

**Area**

- Frontend
- Performance

**Problem Type**

- Layout Thrashing
- Excess Rendering
- Redundant Refresh

### Incident

事项增多后，月视图开始掉帧。

后来针对真实渲染过程做了多层优化：

- DOM 操作改成“写 → 读 → 写”批处理，强制回流从约 42 次降为 1 次；
- 不再为看不见的 Event/Deadline 生成 DOM；
- 节点数量从 462 降到 168；
- 数据 fingerprint 没变就不重建 DOM；
- 翻页先用缓存；
- swipe / spring 动画期间延后后台 render；
- 页面进入后台后暂停轮询和时钟。

最终满月渲染从约 32ms 降到约 10ms。

### Rule

> 前端性能优化优先减少“做了但用户看不到”的工作：少创建、少测量、少 repaint、少重复 render。

---

## 4. 非关键元数据不应该阻塞核心界面

**Area**

- Frontend
- Backend / API
- Performance
- Architecture

**Problem Type**

- Critical Path
- Dependency Coupling

### Incident

Tags 和 Category Suggestions 加入后，一开始它们参与登录后的主加载流程。

这意味着一个非关键 Tag API 变慢，也会让 Calendar 本身继续停在 loading。

后来 Web 和 Android 都改成：

核心首屏只等待 Event、Deadline、Category；

Tags 和推荐数据在后台单独加载，失败也不阻断日历使用。 
课程层后来也使用了相同原则：Course API 不可用时直接回退为空课程层，不能阻断 Event / Deadline。

### Rule

> 把数据依赖分成 blocking 和 enhancing。增强功能失败时，应尽量降级功能，而不是拖垮核心流程。

---

## 5. Responsive 设计应该描述布局条件，而不是设备名称

**Area**

- Frontend
- Android
- Responsive Design

**Problem Type**

- Device Assumption

### Incident

Calendar 先后在手机、短横屏、高密度平板和不同模拟器尺寸上遇到布局问题。

早期根据“手机 / 平板”判断布局并不稳定，后来逐渐改成：

- 用宽高比判断 portrait；
- 用可用 dp 宽度判断是否进入 compact header；
- Modal 根据实际可用高度决定内容区；
- 真实手机 / 平板物理比例分别做回归。

### Lesson

“iPad”“平板”“手机”不是可靠布局条件。

### Rule

> Responsive breakpoint 应围绕内容需要多少空间定义，而不是围绕设备品牌或型号定义。

---

## 6. Platform Safe Area 不能只相信理论 API

**Area**

- Frontend
- Android
- Platform Integration

**Problem Type**

- System Inset
- Device-specific Behaviour

### Incident

Android 新建表单底部按钮曾被系统导航条遮挡。

加入 `navigationBarsPadding` 后，手势导航模式中的 Compose Dialog 又错误报告 bottom inset 为 0，按钮仍然落在系统 gesture bar 后面。

最终手机 sheet 显式加入额外安全区。

### Rule

> 涉及键盘、导航栏、手势区、safe area 的 UI，必须在目标系统模式下实际验证。Framework API 返回“0”不代表物理上真的没有遮挡。

---

# Backend / API / Data Model

## 7. PATCH / partial update 必须明确区分“未提供”和“清空”

**Area**

- Backend / API
- Data Model

**Problem Type**

- Partial Update Semantics
- Data Loss

### Incident

重复事件的 MCP 与 REST partial update 曾需要专门修复：

- omitted 字段应该保留数据库原值；
- `null` 才表示显式清空；
- validation 必须针对 merged state，而不是只看本次 body。

后来 `course_id` 的更新也沿用了相同思路：

如果只修改 `subject_id`，必须把现有 `course_id` 合并后一起检查，不能因为 request body 没包含 course 就漏过一个已经非法的组合。

### Rule

> Partial update 的 validation 对象通常应该是“旧记录 + 本次 patch 后的最终状态”，而不是裸 request body。

---

## 8. 幂等性属于“操作”，不一定属于“资源”

**Area**

- Backend / API
- Database
- Concurrency

**Problem Type**

- Idempotency
- Retry Safety

### Incident

重复 Event 的 split / PATCH 经过多轮设计后，最终没有简单把 `Idempotency-Key` 塞进 series。

因为：

同一个 series 可以发生多个参数完全不同的操作。

最终新增 `event_operations`，记录：

- operation key；
- source series；
- result series；
- request fingerprint；

并在并发冲突后读取已有 operation 返回结果。

### Lesson

资源 ID 回答的是“这是哪个对象”。

Idempotency key 回答的是“这是哪一次操作”。

两者不是同一种身份。

### Rule

> 复杂 mutation 的幂等信息应建模为 operation，而不是勉强塞进业务资源字段。

---

## 9. 复杂领域对象不要为了省表而塞进现有实体

**Area**

- Data Model
- Database
- Architecture

**Problem Type**

- Domain Boundary
- Lifecycle Coupling

### Incident

课程系统最初存在“课程是否可以复用 Event / Category / Tag”之类的方向。

代码审阅后逐渐明确：

- Course 有自己的 Term；
- CourseSlot 有单双周；
- 请假 / 调休属于 Override；
- Course 与 Event / Deadline 生命周期不同；
- Course 虽然有 Subject，但不能因此变成 Event。

最终单独建立：

- terms
- courses
- course_slots
- course_overrides。 
### Rule

> 两种实体“看起来都发生在某个时间”不代表它们属于同一个表。优先比较生命周期、修改语义和约束，而不是表面字段是否相似。

---

## 10. 派生数据不要轻易快照进数据库

**Area**

- Database
- Data Model
- Frontend

**Problem Type**

- Denormalised Derived State
- Semantic Drift

### Incident

早期 Event 创建时，会把 Category 当前颜色直接写入 `event.color`。

当后面需要修改分类颜色时，旧 Event 已经保存了历史色值，因此不会跟着分类变化。

迁移 Academics / Subject 前盘点发现，118 条有效记录中的显式颜色实际上没有真正的用户自定义值，全部只是历史分类色快照。

最终迁移前统一将这类颜色归一为 `NULL`，改为运行时解析：

`显式事项色 > Subject 色 > Category 色`。

### Lesson

存一个“方便显示”的派生字段，很容易在几年后变成无法区分“用户真的覆盖了它”还是“系统当时复制了一份”。

### Rule

> 能从权威关系稳定计算出的展示属性，默认运行时计算。只有存在明确性能或历史快照需求时才持久化。

---

## 11. 同一业务事实只能有一个 Source of Truth

**Area**

- Data Model
- Cross-client Architecture
- Testing

**Problem Type**

- Duplicate Definition
- Data Drift

### Incident

课表页面和 ICS 一开始可能分别维护课程数据，后来抽出统一的 `course-data.js`，页面和 ICS 同时消费，避免两份课表漂移。

Reminders 接入后，同样建立 `fixtures/sample-workspace.json` 作为 Calendar 与 Reminders 的唯一假数据权威副本，并由脚本生成本地 D1 数据。

### Rule

> 一个事实只维护一次。其他格式应转换、投影或生成，而不是人工复制。

---

## 12. Migration 的顺序本身就是生产代码

**Area**

- Database
- Deployment
- Backend

**Problem Type**

- Schema Migration
- Deployment Ordering

### Incident

Academics / Subject migration 0012 中，新代码依赖：

- `subjects` 表；
- `categories.archived`。

因此上线顺序明确为：

1. 建立 D1 Time Travel rollback 点；
2. 应用数据库 migration；
3. 核对生产数据；
4. 再部署新代码。

如果先部署 Functions，新代码会读取尚不存在的字段，直接 500。

### Rule

> Schema rollout 必须设计“旧代码 + 新 schema”和“新代码 + 新 schema”的过渡顺序。Migration 文件写对了，不代表部署过程就是安全的。

---

## 13. 数据迁移不仅要保数据，还要保外部契约

**Area**

- Backend
- Compatibility
- API / ICS

**Problem Type**

- Backward Compatibility

### Incident

Math / Physics / CS 等旧 Category 迁移成 Subject 后，已经存在的 Apple Calendar 订阅 URL 仍然指向旧 category。

如果只把 Category 归档，用户的订阅会静默变空。

因此旧：

`?category=cat-math`

被继续保留，并重定向到新的：

`?subject=sub-math`

实际验证新旧 feed 返回相同事件。

### Rule

> 数据迁移时要盘点的不只有数据库 foreign key，还包括已经离开服务器的 URL、token、subscription、bookmark 和客户端缓存。

---

## 14. 新子系统默认应该 Fail Soft

**Area**

- Backend
- Architecture
- Frontend

**Problem Type**

- Fault Isolation

### Incident

课程层部署时，Calendar 已经拥有稳定的 Event / Deadline 核心。

因此课程 API 被明确设计为：

请求失败或 migration 尚未上线 → 返回空课程投影；

而不是让整个 Calendar 加载失败。

### Rule

> 给成熟产品增加附加子系统时，默认目标应是“新功能坏了，旧功能还能工作”。

---

# Auth / User System / Security

## 15. Cookie Security Policy 必须区分真实生产环境与本地桥接环境

**Area**

- Auth / User System
- Backend
- Android

**Problem Type**

- Environment-specific Authentication

### Incident

Web 早期已经遇到 localhost 不能照搬生产 `Secure` Cookie 的问题。

Android 模拟器联调时再次出现：

`10.0.2.2`

被后端错误识别成生产域名，于是下发 `Secure` Cookie。

但模拟器连接的是本地 HTTP，后续请求不会携带 Secure Cookie，于是登录成功后所有 API 又返回 401。

### Rule

> Cookie security 规则需要明确识别受信任的开发环境。不要简单写成“不是 localhost 就当生产”。

---

## 16. Authentication 与 Authorization 必须分开设计

**Area**

- Auth / User System
- Security
- MCP

**Problem Type**

- Scope
- Privilege Boundary

### Incident

Calendar 的 MCP 后来加入 `calendar.read` scope：

- read token 的 `tools/list` 只返回查询工具；
- 服务端同样拒绝 write 调用；
- 原有 `calendar` scope 保留完整权限。

Category / Subject 又进一步建立独立边界：

OAuth MCP access token 不能直接调用网页侧的 Category / Subject 写 API；只有 session Cookie 或全权 API token 可以。

实际测试：

- MCP token 请求 REST Category/Subject → 401；
- 同一个 token 请求 `/mcp` → 正常。

### Lesson

“这个 token 是真的”只解决 authentication。

它能做什么，仍然需要独立 authorization。

### Rule

> 每种 credential 都应该有明确 trust boundary、audience 和 capability，不要把“已登录”当成“可以做所有操作”。

---

## 17. Tool Schema 是 AI 提示，不是安全边界

**Area**

- AI / MCP
- Backend
- Security

**Problem Type**

- Server-side Validation

### Incident

MCP schema 使用 `additionalProperties:false`，看起来表示模型不能传未声明字段。

实际测试发现：

服务端没有真正检查这些额外参数。

即使从 schema 中删除了 `group_title`，直接传过去仍然可能写入。

后来合并通用 `calendar_update` 时，专门增加 `rejectCrossTypeFields()`：

- Event 不允许 priority；
- Deadline 不允许 start_time / reminders；
- 非法字段在运行时真正拒绝。

### Rule

> JSON Schema、prompt、tool description 都只是调用方约束。真正的数据安全必须由服务端 runtime validation 保证。

---

## 18. AI Agent 的写入路径应该按“不可信客户端”设计

**Area**

- AI / MCP
- Backend
- Data Model
- Security

**Problem Type**

- Invalid Agent Write
- Missing Validation

### Incident

AI 曾通过 MCP 创建一个事件，并把 category 写成根本不存在的：

`UXR课程`

问题不在模型“犯错”本身，而在后端允许任何 category string 落库。

治本方式不是继续加强 prompt，而是新增 `ensureCategoryExists()`，接入全部 REST、Import、Series、Deadline 和 MCP 写入路径。

非法分类从此统一在服务器拒绝。

### Lesson

LLM 很容易暴露原本普通 UI 不会触发的 API 边界漏洞。

### Rule

> Agent 接口应按恶意或错误客户端设计。任何数据库 invariant 都不能只依赖 prompt 或 UI picker。

---

## 19. 不该由 AI 控制的字段，就不要放进工具面

**Area**

- AI / MCP
- Security
- Data Model

**Problem Type**

- Excess Capability
- Tool Surface Design

### Incident

Subject / Category 后来被定义为底层语义，不应该让 AI 随意创造。

同样，migration 0012 之后 color 应由 Category / Subject 决定。

如果 AI 在创建事项时写死 `color`，这一条记录以后就不会跟随全局配色更新。

因此 color 被从 MCP 六个写工具的 input schema 中移除；服务端旧能力为了 REST / import 兼容仍保留。

### Rule

> Tool design 不只是“AI 能不能完成任务”，还包括“AI 是否应该拥有这个自由度”。

---

## 20. 工具数量少不一定比工具语义清晰更重要

**Area**

- AI / MCP
- API Design

**Problem Type**

- Tool Ambiguity
- Schema Expressiveness

### Incident

Calendar 曾考虑进一步合并 MCP tools。

最终：

- `update Event + update Deadline` 可以合并，因为两边核心 required 字段基本一致；
- `delete` 也可以合并；
- `create` 不合并。

原因是如果把 Event / Deadline create 合成一个工具，原本分别 required 的：

- `start_time`
- `due_time`

都会因为 union schema 限制而掉出 required，只能靠 description 告诉模型，增加误用概率。

类似问题已经出现在 17 参数、required 为空的 `calendar_update_event_series`。

### Rule

> AI tool 应优先优化“能否被模型正确调用”，而不是单纯追求工具数量最少。

---

## 21. Public Repository 的隐私边界不仅是 Secret

**Area**

- Security
- Privacy
- Git

**Problem Type**

- Personal Data Exposure

### Incident

课表数据原本包含教师姓名，而：

- GitHub repo 是公开的；
- `/schedule/` 是公开的；
- `/schedule.ics` 也是公开的。

因此教师姓名从公开 JS、migration seed 和 ICS 中移除。

原始个人课表 xlsx 也从仓库根目录移到被 `.gitignore` 排除的 `production/`。

### Rule

> Public repo 审计需要检查真实人物、文件内容、fixtures、migration seed、文件名和公开接口，不只是 `.env` 和 token。

---

# Notifications / State / Sync

## 22. 本地提醒是服务器数据的 Projection，不是独立真相

**Area**

- State / Sync
- Notifications
- Android

**Problem Type**

- Cross-device Consistency
- Stale Local State

### Incident

用户可能在 Web 上：

- 删除 Event；
- 改时间；
- 关闭提醒；
- 完成 Deadline。

Android 上原先已经安排的 `AlarmManager` 并不会自动知道这些变化。

结果可能是服务器已经没有事项，但手机仍然在未来触发“幽灵提醒”。

最终每次同步月份时：

1. 取消上一份该月 cache 对应的全部本地 alarm；
2. 拉取服务器权威数据；
3. 根据新结果重新调度。

并实际验证远端软删除后旧 alarm 被取消。

### Rule

> 如果本地状态只是服务器状态的可重建 projection，重新同步时优先整体 reconcile，而不是假设所有远端变化都能通过增量事件准确追踪。

---

## 23. 系统生命周期事件必须显式接入

**Area**

- Android
- Notifications
- Platform Integration

**Problem Type**

- OS Lifecycle

### Incident

Android 重启后，`AlarmManager` 中的 alarms 会被系统清空。

虽然 App 已经实现了从 cache 重建提醒的代码，但 `BootCompletedReceiver` 没有正确暴露给系统，系统广播根本无法触发恢复流程。

修复 receiver 后，才真正通过重启端到端验证提醒恢复。

### Rule

> “恢复代码存在”不等于“恢复机制存在”。涉及 OS 生命周期时必须验证系统是否真的会调用入口。

---

## 24. Notification 要有“过期语义”

**Area**

- Notifications
- Product / UX
- Backend

**Problem Type**

- Stale Notification

### Incident

早期历史未读或延迟 dispatch 的提醒可能在用户再次登录后重新弹出。

后来明确规定：

- 历史未读不重复弹浏览器 toast；
- 已经过期的全天 Event 不补发；
- Deadline 到期后的提前提醒不补发；
- 超过一定时间的最终 due reminder 也不再陈旧发送。

### Rule

> Notification 不是“最终必须送达的消息队列”。很多提醒一旦错过时间窗口，正确行为是丢弃，而不是补发。

---

# Deployment / Infrastructure

## 25. 部署的是一个 Runtime，不是一堆静态文件

**Area**

- Deployment
- Cloudflare
- Backend

**Problem Type**

- Partial Deployment

### Incident

一次 frontend-only Pages deployment 只上传了前端资源。

结果 Pages Functions 没有正确跟随上线，所有 Apple Calendar subscription URL 都 fall through 到 HTML。

最终需要重新部署完整 Functions runtime，ICS 才恢复 `text/calendar`。

### Rule

> Full-stack 项目部署时必须明确 artifact 边界。前端文件成功上线不等于应用成功上线。

---

## 26. Production Deployment 不应该携带工作区里的无关修改

**Area**

- Git
- Deployment
- Tooling

**Problem Type**

- Dirty Worktree Deployment

### Incident

在 Apple Preview 和正式前端切换期间，工作区同时存在未提交的 backend 改动。

为了只上线目标前端，Calendar 使用基于干净 commit 的 detached worktree 进行部署，避免把本轮无关修改一起发布。 
### Rule

> 部署输入应该来自一个可描述、可复现的 snapshot，而不是“当前目录现在碰巧长什么样”。

---

## 27. Static Asset Versioning 是前后端契约的一部分

**Area**

- Deployment
- Frontend
- Cache

**Problem Type**

- Mixed-version Client

### Incident

Tag 版本上线后曾出现：

新 HTML + 浏览器旧缓存 app.js

导致 Calendar 一直停在 loading。

之后 CSS / JS 资源统一使用 versioned URL。24 小时时间输入等改动上线时也同步 bump asset version，避免 HTML 和 JavaScript 来自不同版本。 
### Rule

> 如果 HTML 与 JS 必须同步演化，就必须有缓存失效机制。否则 CDN / Browser cache 会主动创造一个你从未测试过的“混合版本”。

---

## 28. CDN 验证时要区分“部署失败”和“边缘尚未传播”

**Area**

- Deployment
- Cloudflare
- Testing

**Problem Type**

- Cache Propagation
- False Failure Diagnosis

### Incident

几次生产部署后：

- deployment preview 已经是新版本；
- 正式域名仍短暂返回旧 ETag / 旧 app.js；
- 随机 query 可以取得新版本；
- 数十秒至约一分钟后正式 URL 自动更新。

这不是部署失败，而是边缘缓存传播延迟。 
### Rule

> CDN 上线验证应同时检查 deployment URL、正式域名、cache-busting request 和响应版本标识，不要用一次旧缓存响应直接判断发布失败。

---

# Testing

## 29. Regression Test 应覆盖真正的系统入口，而不只覆盖 helper

**Area**

- Testing
- Backend / API
- MCP

**Problem Type**

- Integration Gap

### Incident

`course_id` 最初已有底层 validation 测试，但真正对外使用的是：

- REST route；
- MCP route；
- merged partial update；
- complete/read 回传。

后来新增 route-level Fake D1 测试，覆盖：

- 有/无 course_id；
- inactive Course；
- course 不存在；
- Subject 不匹配；
- 普通 Category 带 course；
- PUT 修改和清除；
- 只修改 subject 时残留 course 的 merged-state validation；
- MCP create/get/list/update/complete 往返；
- Event 错传 course_id。

同时 Fake D1 自己也明确写出“不模拟什么”，防止测试替身被误认为真实 D1。

### Rule

> Helper test 证明规则函数正确；route test 才能证明真实调用链没有把规则绕过去。

---

## 30. Test Double 的能力边界也应该进入文档

**Area**

- Testing
- Tooling

**Problem Type**

- Fake Fidelity

### Incident

Course route tests 使用最小 Fake D1，但明确声明：

它只模拟当前测试真正需要的 SQL shape，不模拟完整 deadline query/filter/reminder 行为。

### Lesson

Fake 越像真系统，维护成本越高；Fake 太简单，又可能产生虚假的安全感。

### Rule

> 使用 fake / stub 时，同时记录“它验证了什么”和“它没有验证什么”。

---

# Standards / Interoperability

## 31. 时间需要先区分“瞬间”与“墙钟语义”

**Area**

- Backend
- Calendar / ICS
- Time

**Problem Type**

- Timezone Semantics

### Incident

课表是“上海时间每周第几节课”，本质是 wall-clock schedule。

因此 ICS 没有简单把所有时间转成 UTC，而是使用：

`DTSTART;TZID=Asia/Shanghai`

并提供 `VTIMEZONE`。

但 RRULE 的 `UNTIL` 又按标准要求使用 UTC。

### Rule

> 处理时间前先判断业务语义是“某一绝对瞬间”还是“某地区墙钟上的固定时间”。不要机械地把所有时间都 UTC 化。

---

## 32. 外部标准要按实际规范验证，不能靠字段名字猜

**Area**

- Backend
- Standards
- ICS

**Problem Type**

- Protocol Compliance

### Incident

Calendar ICS 配色时发现：

- RFC 7986 `COLOR` 接受 CSS3 color keyword；
- Apple `X-APPLE-CALENDAR-COLOR` 需要 8 位 hex。

因此同一个业务颜色需要序列化成两套格式。

甚至最近颜色名称算法从亮度加权距离改回 RGB 欧氏距离，才能避免 Physics 青蓝色被映射成不合适的 CSS 色名。

### Rule

> 外部协议字段必须按协议实际约束实现和测试。名字类似不代表格式兼容。

---

## 33. 外部同步系统中的 Stable ID 不应该依赖可编辑显示内容

**Area**

- Backend
- ICS
- Data Model

**Problem Type**

- Stable Identity

### Incident

课表 ICS 的 UID 按：

`星期 × 节次`

生成，而不是使用课程名称。

因此 ESL / EL 等课程改名时，Apple Calendar 仍然识别为原事件更新，而不是创建重复事件。

### Rule

> Stable identity 应来源于业务身份，不应来源于 title、display name 之类用户可编辑字段。

---

# Architecture / Product

## 34. 领域层级和视觉优先级是两个不同问题

**Area**

- Architecture
- Product / UX
- Frontend

**Problem Type**

- Information Hierarchy

### Incident

Course 在数据层是正式一等实体，但加入主界面后用户认为它抢走了 Event / Deadline 的注意力。

最终没有删除 Course，而是把它降成低优先级图层：

- 月视图变成细色条；
- 不占 Event chip / portrait dot 名额；
- Inspector 排在 Deadline 和 Event 后；
- 仍保持固定高度和完整功能。

### Rule

> 数据模型中的“一等实体”不代表 UI 中也必须是一等视觉对象。视觉层级应该由用户任务优先级决定。

---

## 35. Backend Invariant 应该表达业务关系，而不是当前 UI 能不能做到

**Area**

- Backend
- Database
- Cross-client Architecture

**Problem Type**

- Domain Invariant

### Incident

Deadline 后来增加 `course_id`。

Calendar 后端并不关心 Reminders 当前 UI 如何选课，而只负责维护长期业务 invariant：

- Course 必须存在；
- Deadline 必须属于 Academics；
- Subject 必须存在且与 Course 一致；
- inactive Course 是否允许关联是明确的产品规则；
- REST 与 MCP 必须执行同一套校验。

### Rule

> Backend 的职责是保证最终状态合法，而不是复制某个客户端当前的推理流程。

---

# 从 Calendar 得出的高层原则

截至目前，Calendar 最值得升级成通用工程规则的经验可以压缩成：

1. **UI 稳定性是交互正确性的一部分。**
2. **昂贵视觉效果需要和业务代码一样做性能分析。**
3. **性能优化优先消除无意义 render、layout 和 request。**
4. **非关键数据不要进入核心加载 critical path。**
5. **Responsive 根据空间条件设计，不根据设备名称设计。**
6. **Platform inset / lifecycle 必须做真实系统验证。**
7. **PATCH 必须区分 omitted、null 和 merged state。**
8. **幂等属于 operation，不一定属于 resource。**
9. **不同生命周期的实体不要为了省表强行复用。**
10. **可派生展示数据默认不要持久化快照。**
11. **同一业务事实只能有一个 Source of Truth。**
12. **Migration deployment order 是生产架构的一部分。**
13. **Migration 还要兼容已经流出的 URL 和外部订阅。**
14. **新子系统应 Fail Soft，不拖垮成熟核心。**
15. **Authentication 与 Authorization 必须分开。**
16. **Credential 必须有 audience、scope 和 capability。**
17. **Tool Schema 不能替代服务器 validation。**
18. **AI Agent 写接口应按不可信客户端设计。**
19. **不该让 AI 控制的自由度，不要暴露进 tool schema。**
20. **AI tool 优先追求语义清晰，而不是工具数量最少。**
21. **本地提醒和缓存是 server state 的 projection。**
22. **Notification 需要明确过期语义。**
23. **部署必须来自明确、完整、可复现的 snapshot。**
24. **Static assets 与代码一样需要版本兼容策略。**
25. **CDN cache propagation 需要独立于 deployment success 判断。**
26. **Helper test、route test、production verification 各自验证不同层。**
27. **Fake / Stub 也必须记录其模拟边界。**
28. **时间首先区分 absolute instant 和 wall-clock semantics。**
29. **实现外部标准要按规范，而不是凭字段名猜。**
30. **Stable ID 不应依赖可编辑显示内容。**
31. **领域重要性与视觉重要性是两套层级。**
32. **Backend invariant 应独立于客户端实现。**

---

## Calendar 特别丰富的经验方向

如果按 Area 统计，这个项目目前最有价值的经验主要集中在：

- `Backend / API`
- `Database`
- `Auth / User System`
- `State / Sync`
- `Frontend`
- `Testing`
- `Deployment / Infrastructure`
- `AI / MCP`
- `Notifications`
- `Data Model`
- `Standards / Interoperability`
- `Cross-client Architecture`

它与 Reminders 的互补很明显：

Reminders 更集中在 **LLM integration、AI validation、SwiftUI state 和 prompt experimentation**；

Calendar 更集中在 **真正的后端系统、数据库迁移、权限边界、长期兼容、跨客户端同步和生产部署**。

这两个项目合起来，已经覆盖了相当完整的一套实际软件工程问题。
---

## 新增条目的写法

追加到对应的 Area 分组末尾，编号顺延，沿用现有结构：

```
## N. 一句话结论（陈述原则，不是描述 bug）

**Area**

- Backend / API | Database | Frontend | Auth / User System | State / Sync
- Testing | Security | Performance | Deployment / Infrastructure
- Data Model | Product / UX | Tooling | AI / MCP | Standards / Interoperability

**Problem Type**

- 更具体的问题类别

### Incident

真实发生了什么（对应 `updates.md` 里的哪几次改动）。

### Lesson

这次经历说明了什么（如果 Incident 已经说清楚，可以省略这一节）。

### Rule

> 以后别的项目可以直接采用的原则。
```

写完后同步维护文末〈从 Calendar 得出的高层原则〉列表，
否则那份压缩清单会和正文逐渐脱节。

条目必须来自 `updates.md` 里真实发生过的事，不要写没踩过的“最佳实践”。
