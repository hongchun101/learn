// =============================================================================
// src/examples/task_manager.cj - 综合示例：任务管理器
// =============================================================================
// 演示一个完整的 Cangjie 应用：使用 enum、泛型、模式匹配、闭包、扩展。
// 展示真实业务场景下 Cangjie 语法的综合应用。
// =============================================================================

package cangjie_learning.examples

import std.collection.*

// =============================================================================
// 领域模型
// =============================================================================

/// 任务优先级
public enum Priority {
    | Low
    | Medium
    | High
    | Urgent

    public func weight(): Int64 {
        match (this) {
            case Low => 1
            case Medium => 2
            case High => 3
            case Urgent => 4
        }
    }

    public func label(): String {
        match (this) {
            case Low => "低"
            case Medium => "中"
            case High => "高"
            case Urgent => "紧急"
        }
    }

    public operator func ==(other: Priority): Bool {
        match ((this, other)) {
            case (Low, Low) => true
            case (Medium, Medium) => true
            case (High, High) => true
            case (Urgent, Urgent) => true
            case _ => false
        }
    }

    public operator func !=(other: Priority): Bool {
        return !(this == other)
    }
}

/// 任务状态（状态机）
public enum TaskStatus {
    | Todo
    | InProgress(String, Int64)        // (assignee, progress)
    | InReview
    | Done(String)                     // (completedAt)
    | Archived

    public func isActive(): Bool {
        match (this) {
            case Todo => true
            case InProgress(_, _) => true
            case InReview => true
            case _ => false
        }
    }
}

/// 任务
public class Task {
    public let id: Int64
    public var title: String
    public var description: String
    public var priority: Priority
    public var status: TaskStatus
    public let createdAt: String
    public var tags: ArrayList<String>

    public init(id: Int64, title: String, description: String, priority: Priority) {
        this.id = id
        this.title = title
        this.description = description
        this.priority = priority
        this.status = TaskStatus.Todo
        this.createdAt = "2026-01-15"
        this.tags = ArrayList<String>()
    }

    public func addTag(tag: String): Unit {
        if (!tags.contains(tag)) {
            tags.add(tag)
        }
    }

    public func assignTo(assignee: String): Unit {
        this.status = TaskStatus.InProgress(assignee, 0)
    }

    public func updateProgress(progress: Int64): Unit {
        match (status) {
            case TaskStatus.InProgress(assignee, _) =>
                this.status = TaskStatus.InProgress(assignee, progress)
            case _ =>
                println("任务 #${id} 未分配")
        }
    }

    public func complete(): Unit {
        this.status = TaskStatus.Done("2026-01-20")
    }

    public func summary(): String {
        let statusStr = match (status) {
            case TaskStatus.Todo => "待办"
            case TaskStatus.InProgress(assignee, progress) => "进行中 (${assignee}, ${progress}%)"
            case TaskStatus.InReview => "评审中"
            case TaskStatus.Done(at) => "已完成 (${at})"
            case TaskStatus.Archived => "已归档"
        }
        return "[#${id}] ${title} | ${priority.label()} | ${statusStr}"
    }
}

// =============================================================================
// 仓储（仓储模式 + 泛型）
// =============================================================================

/// 通用仓储（演示用 Map 存储）
public class Repository<T, ID> where ID <: Hashable & Equatable<ID> {
    private var store: HashMap<ID, T>
    private var nextId: ID
    private var incrementFn: (ID) -> ID

    public init(initialId!: ID, incrementFn!: (ID) -> ID) {
        this.store = HashMap<ID, T>()
        this.nextId = initialId
        this.incrementFn = incrementFn
    }

    public func save(entity: T): ID {
        let id = nextId
        nextId = incrementFn(nextId)
        store[id] = entity
        return id
    }

    public func findById(id: ID): ?T {
        match (store.get(id)) {
            case Some(v) => Some(v)
            case None => None
        }
    }

    public func findAll(): ArrayList<T> {
        var result = ArrayList<T>()
        for ((_, v) in store) {
            result.add(v)
        }
        return result
    }

    public func delete(id: ID): Bool {
        match (store.remove(id)) {
            case Some(_) => return true
            case None => return false
        }
    }

    public func count(): Int64 {
        return Int64(store.size)
    }
}

// =============================================================================
// 业务服务（组合仓储 + 业务逻辑）
// =============================================================================

public class TaskService {
    public let repository: Repository<Task, Int64>

    public init() {
        this.repository = Repository<Task, Int64>(
            initialId: 1,
            incrementFn: { id => id + 1 }
        )
    }

    public func createTask(title: String, description: String, priority: Priority): Int64 {
        let task = Task(
            repository.count() + 1,
            title,
            description,
            priority
        )
        return repository.save(task)
    }

    public func assignTask(taskId: Int64, assignee: String): Unit {
        match (repository.findById(taskId)) {
            case Some(task) => task.assignTo(assignee)
            case None => println("任务 #${taskId} 不存在")
        }
    }

    public func getActiveTasks(): ArrayList<Task> {
        var result = ArrayList<Task>()
        for (t in repository.findAll()) {
            if (t.status.isActive()) {
                result.add(t)
            }
        }
        return result
    }

    public func getTasksByPriority(priority: Priority): ArrayList<Task> {
        var result = ArrayList<Task>()
        for (t in repository.findAll()) {
            if (t.priority == priority) {
                result.add(t)
            }
        }
        return result
    }

    public func getHighPriorityTasks(): ArrayList<Task> {
        var result = ArrayList<Task>()
        for (t in repository.findAll()) {
            if (t.priority.weight() >= Priority.High.weight()) {
                result.add(t)
            }
        }
        return result
    }

    public func searchTasks(keyword: String): ArrayList<Task> {
        var result = ArrayList<Task>()
        for (t in repository.findAll()) {
            if (t.title.contains(keyword) || t.description.contains(keyword)) {
                result.add(t)
            }
        }
        return result
    }

    public func printAllTasks(): Unit {
        println("===== 所有任务 =====")
        let tasks = sortedByPriority(repository.findAll())
        for (t in tasks) {
            println(t.summary())
        }
    }

    private func sortedByPriority(tasks: ArrayList<Task>): ArrayList<Task> {
        var arr = tasks
        let n = arr.size
        var i: Int64 = 0
        while (i < n - 1) {
            var j: Int64 = 0
            while (j < n - 1 - i) {
                if (arr[j].priority.weight() < arr[j + 1].priority.weight()) {
                    let tmp = arr[j]
                    arr[j] = arr[j + 1]
                    arr[j + 1] = tmp
                }
                j += 1
            }
            i += 1
        }
        return arr
    }
}

// =============================================================================
// 演示入口
// =============================================================================

public func taskManagerDemo(): Unit {
    println("[Example] 任务管理器演示")

    let service = TaskService()

    // 创建任务
    let id1 = service.createTask("实现登录功能", "用户通过邮箱密码登录系统", Priority.High)
    let id2 = service.createTask("修复首页 Bug", "首页加载速度慢的问题", Priority.Urgent)
    let id3 = service.createTask("编写单元测试", "为核心模块补充测试", Priority.Medium)
    let id4 = service.createTask("更新文档", "API 文档补充新接口说明", Priority.Low)
    let _ = service.assignTask(id3, "Charlie")  // 分配
    let _ = service.assignTask(id4, "Dave")
    // 添加标签
    if (let Some(t) <- service.repository.findById(id1)) {
        t.addTag("backend")
        t.addTag("auth")
    }

    // 分配任务
    service.assignTask(id1, "Alice")
    service.assignTask(id2, "Bob")

    // 更新进度
    if (let Some(t) <- service.repository.findById(id1)) {
        t.updateProgress(50)
    }

    // 查询并展示
    println("--- 所有任务（按优先级）---")
    service.printAllTasks()
    println("")

    println("--- 高优先级任务 ---")
    for (t in service.getHighPriorityTasks()) {
        println(t.summary())
    }
    println("")

    println("--- 搜索 'Bug' ---")
    for (t in service.searchTasks("Bug")) {
        println(t.summary())
    }
}
