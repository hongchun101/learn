package io.github.dddlearning.architecture

/** A source-level dependency from one fully qualified type or package name to another. */
data class Dependency(val source: String, val target: String) {
    init {
        require(source.isNotBlank()) { "Dependency source must not be blank" }
        require(target.isNotBlank()) { "Dependency target must not be blank" }
    }
}

/** A dependency rule whose result is based only on names supplied by build/source tooling. */
fun interface DependencyRule {
    fun violation(dependency: Dependency): ArchitectureViolation?
}

data class ArchitectureViolation(
    val rule: String,
    val dependency: Dependency,
)

/**
 * Reflection-free architecture fitness helpers.
 *
 * Feed these rules dependency strings from a compiler plugin, a class-file scanner, or a simple
 * import parser. Matching honors package boundaries, so `ordering` does not match `ordering2`.
 */
object ArchitectureFitness {
    fun forbidDependency(
        sourcePrefix: String,
        targetPrefix: String,
        description: String = "$sourcePrefix must not depend on $targetPrefix",
    ): DependencyRule {
        require(sourcePrefix.isNotBlank()) { "Source prefix must not be blank" }
        require(targetPrefix.isNotBlank()) { "Target prefix must not be blank" }
        require(description.isNotBlank()) { "Rule description must not be blank" }

        return DependencyRule { dependency ->
            if (dependency.source.isWithin(sourcePrefix) && dependency.target.isWithin(targetPrefix)) {
                ArchitectureViolation(description, dependency)
            } else {
                null
            }
        }
    }

    fun boundedContextIsolation(
        rootPackage: String,
        contextPackages: Set<String>,
    ): List<DependencyRule> {
        require(rootPackage.isNotBlank()) { "Root package must not be blank" }
        require(contextPackages.none(String::isBlank)) { "Context package must not be blank" }

        return contextPackages.flatMap { source ->
            contextPackages
                .asSequence()
                .filterNot { it == source }
                .map { target ->
                    forbidDependency(
                        sourcePrefix = "$rootPackage.$source.domain",
                        targetPrefix = "$rootPackage.$target",
                        description = "$source domain must not depend on $target context",
                    )
                }
                .toList()
        }
    }

    fun inspect(
        dependencies: Iterable<Dependency>,
        rules: Iterable<DependencyRule>,
    ): List<ArchitectureViolation> = dependencies.flatMap { dependency ->
        rules.mapNotNull { rule -> rule.violation(dependency) }
    }

    private fun String.isWithin(prefix: String): Boolean = this == prefix || startsWith("$prefix.")
}
