plugins {
    application
}

dependencies {
    implementation(project(":shared-kernel"))
    implementation(project(":ordering"))
    implementation(project(":inventory"))
    implementation(project(":payments"))
}

application {
    mainClass.set("io.github.dddlearning.bootstrap.DddLearningApplicationKt")
}
