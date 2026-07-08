// =============================================================================
// Cangjie 学习项目 - 主入口
// =============================================================================
// 本文件作为整个学习项目的入口点。运行时会按顺序演示各个模块的语法特性。
// =============================================================================

package cangjie_learning

import cangjie_learning.basics.*
import cangjie_learning.functions.*
import cangjie_learning.structs_classes.*
import cangjie_learning.enums.*
import cangjie_learning.interfaces_traits.*
import cangjie_learning.generics.*
import cangjie_learning.pattern_matching.*
import cangjie_learning.lambdas.*
import cangjie_learning.extensions.*
import cangjie_learning.operator_overloading.*
import cangjie_learning.error_handling.*
import cangjie_learning.concurrency.*
import cangjie_learning.advanced_types.*
import cangjie_learning.collection_ops.*

main(): Int64 {
    println("===============================================")
    println("  仓颉（Cangjie）编程语言 - 高级语法学习项目")
    println("===============================================")
    println("")

    basicsDemo()
    functionsDemo()
    structsDemo()
    enumsDemo()
    traitsDemo()
    genericsDemo()
    matchingDemo()
    lambdasDemo()
    extensionsDemo()
    operatorsDemo()
    errorsDemo()
    concurrencyDemo()
    advancedTypesDemo()
    collectionsDemo()

    println("")
    println("===============================================")
    println("  全部演示完成")
    println("===============================================")
    return 0
}