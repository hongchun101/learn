// =============================================================================
// examples/task_manager.cj - 综合示例：任务管理器
// =============================================================================
// 演示一个完整的 Cangjie 应用：使用 enum、泛型、模式匹配、闭包、扩展等
// 展示真实业务场景下 Cangjie 语法的综合应用
// =============================================================================

package examples

// 导入需要的模块
import enums.*
import generics.*
import lambdas.*
import collections.*

main(): Int64 {
    let manager = TaskManager()
    manager.run()
    return 0
}

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
}

/// 任务状态（状态机）
public enum TaskStatus {
    | Todo
    | InProgress(assignee: String, progress: Int64)      // 0..100
    | InReview
    | Done(completedAt: String)
    | Archived

    public func isActive(): Bool {
        match (this) {
            case Todo | InProgress(_, _) | InReview => true
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
            tags.append(tag)
        }
    }

    public func assignTo(assignee: String): Unit {
        this.status = TaskStatus.InProgress(assignee: assignee, progress: 0)
    }

    public func updateProgress(progress: Int64): Unit {
        match (status) {
            case TaskStatus.InProgress(assignee, _) =>
                this.status = TaskStatus.InProgress(assignee: assignee, progress: progress)
            case _ =>
                println("任务未分配")
        }
    }

    public func complete(): Unit {
        this.status = TaskStatus.Done(completedAt: "2026-01-20")
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
// 仓库（仓储模式 + 泛型）
// =============================================================================

/// 通用仓库
public class Repository<T, ID> where ID <: Hashable & Equatable<ID> {
    private var store: HashMap<ID, T>
    private var nextId: ID
    private var incrementFn: (ID) -> ID

    public init(initialId: ID, incrementFn: (ID) -> ID) {
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

    public func findById(id: ID): Option<T> {
        match (store.get(id)) {
            case Some(v) => Some(v)
            case None => None
        }
    }

    public func findAll(): Array<T> {
        var result = ArrayList<T>()
        for ((_, v) in store) {
            result.append(v)
        }
        return result.toArray()
    }

    public func delete(id: ID): Bool {
        return store.remove(id)
    }

    public func count(): Int64 {
        return Int64.fromInt64(store.size)
    }
}

// =============================================================================
// 业务服务（组合仓储 + 业务逻辑）
// =============================================================================

public class TaskService {
    private let repository: Repository<Task, Int64>

    public init() {
        this.repository = Repository<Task, Int64>(
            initialId: 1,
            incrementFn: { id => id + 1 }
        )
    }

    public func createTask(title: String, description: String, priority: Priority): Int64 {
        let task = Task(
            id: repository.count() + 1,
            title: title,
            description: description,
            priority: priority
        )
        return repository.save(task)
    }

    public func assignTask(taskId: Int64, assignee: String): Unit {
        match (repository.findById(taskId)) {
            case Some(task) => task.assignTo(assignee)
            case None => println("任务 #${taskId} 不存在")
        }
    }

    public func getActiveTasks(): Array<Task> {
        return filter(repository.findAll(), { t => t.status.isActive() })
    }

    public func getTasksByPriority(priority: Priority): Array<Task> {
        return filter(repository.findAll(), { t => t.priority == priority })
    }

    public func getHighPriorityTasks(): Array<Task> {
        return filter(repository.findAll(), { t => t.priority.weight() >= Priority.High.weight() })
    }

    public func searchTasks(keyword: String): Array<Task> {
        return filter(repository.findAll(), { t =>
            t.title.contains(keyword) || t.description.contains(keyword)
        })
    }

    public func printAllTasks(): Unit {
        println("===== 所有任务 =====")
        let tasks = sortedByPriority(repository.findAll())
        for (t in tasks) {
            println(t.summary())
        }
    }

    private func sortedByPriority(tasks: Array<Task>): Array<Task> {
        // 简化：冒泡排序
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
// 应用入口
// =============================================================================

public class TaskManager {
    private let service: TaskService

    public init() {
        this.service = TaskService()
    }

    public func run(): Unit {
        println("============================================")
        println("  任务管理器 - 综合示例")
        println("============================================")
        println("")

        // 创建任务
        let id1 = service.createTask(
            "实现登录功能",
            "用户通过邮箱密码登录系统",
            Priority.High
        )
        let id2 = service.createTask(
            "修复首页 Bug",
            "首页加载速度慢的问题",
            Priority.Urgent
        )
        let id3 = service.createTask(
            "编写单元测试",
            "为核心模块补充测试",
            Priority.Medium
        )
        let id4 = service.createTask(
            "更新文档",
            "API 文档补充新接口说明",
            Priority.Low
        )

        // 分配任务
        service.assignTask(id1, "Alice")
        service.assignTask(id2, "Bob")

        // 查询并展示
        println("--- 所有任务（按优先级）---")
        service.printAllTasks()
        println("")

        println("--- 高优先级任务 ---")
        let highTasks = service.getHighPriorityTasks()
        for (t in highTasks) {
            println(t.summary())
        }
        println("")

        println("--- 搜索 'Bug' ---")
        let bugTasks = service.searchTasks("Bug")
        for (t in bugTasks) {
            println(t.summary())
        }
        println("")

        println("--- 完成任务 ---")
        match (service.assignTask) {     // 仅作语法示意
            case _ => ()
        }

        println("============================================")
        println("  演示完成")
        println("============================================")
    }
}