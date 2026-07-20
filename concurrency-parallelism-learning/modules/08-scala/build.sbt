ThisBuild / scalaVersion := "3.3.4"
ThisBuild / organization := "learn.cp"
ThisBuild / version      := "0.1.0-SNAPSHOT"

val scalaTestV = "3.2.19"

lazy val root = (project in file("."))
  .settings(
    name := "cp-scala",
    libraryDependencies ++= Seq(
      "org.scalatest"        %% "scalatest"     % scalaTestV,
      "com.typesafe.akka"    %% "akka-actor-typed" % "2.10.0",
      "dev.zio"              %% "zio"           % "2.1.16",
      "dev.zio"              %% "zio-streams"   % "2.1.16",
      "dev.zio"              %% "zio-test"      % "2.1.16" % Test
    ),
    scalacOptions ++= Seq(
      "-deprecation",
      "-feature",
      "-unchecked",
      "-Wnonunit-statement",
      "-Wvalue-discard",
      "-Wunused:imports"
    )
  )
