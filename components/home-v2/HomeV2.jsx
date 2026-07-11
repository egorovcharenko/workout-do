"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/db/api";
import { useAuth } from "@/lib/firebase/auth";
import { signOut } from "@/lib/firebase/auth-actions";
import {
  LEGACY_WORKOUT_NAMES,
  WORKOUTS,
  deloadDaysLeft,
  estimateTemplateWorkoutDuration,
  isDeloadActive,
  localDate,
  parseWorkoutPlan,
} from "@/lib/legacy/shared";
import { isRepsOnlyExercise } from "@/lib/legacy/standards";
import { effectiveExerciseWeight } from "@/lib/legacy/cable-stack";
import styles from "./HomeV2.module.css";

const PROGRAM_ORDER = ["Main: Squat", "Micro: Arms", "Main: Deadlift", "Micro: Delts & Traps"];
const PROGRAM = WORKOUTS.filter((workout) => workout.program);

const normalizeWorkoutName = (name) => LEGACY_WORKOUT_NAMES[name] || name;

function workoutExerciseNames(workout) {
  return workout.exercises.flatMap((exercise) =>
    exercise.supersetExercises
      ? exercise.supersetExercises.map((nested) => nested.name)
      : [exercise.name],
  );
}

function expectedSetCount(workout, deload) {
  return workout.exercises.reduce((total, exercise) => {
    if (exercise.supersetExercises) {
      return total + exercise.supersetExercises.length * (deload ? 1 : exercise.sets || 3);
    }
    const warmups = exercise.noWarmup ? 0 : exercise.warmups || 1;
    return total + warmups + (deload ? 1 : exercise.sets || 3);
  }, 0);
}

function formatDuration(seconds) {
  if (!seconds) return "—";
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

function formatDate(date, options = {}) {
  if (!date) return "—";
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", options);
}

function sessionVolume(session) {
  return (session.sets || []).reduce((total, set) => {
    if (set.set_type !== "working" || isRepsOnlyExercise(set.exercise)) return total;
    return total + effectiveExerciseWeight(set.exercise, Number(set.weight_lb) || 0) * (parseInt(set.reps, 10) || 0);
  }, 0);
}

function calendarDays(history) {
  const sessionDates = new Map();
  history.forEach((session) => {
    if (!session.date || !(session.sets || []).some((set) => set.reps)) return;
    const existing = sessionDates.get(session.date) || { count: 0, deload: true };
    existing.count += 1;
    existing.deload = existing.deload && !!session.is_deload;
    sessionDates.set(session.date, existing);
  });

  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (13 - index));
    const key = localDate(date);
    return {
      key,
      label: date.toLocaleDateString("en-US", { weekday: "narrow" }),
      day: date.getDate(),
      ...sessionDates.get(key),
      isToday: index === 13,
    };
  });
}

async function fetchDashboard() {
  const [history, activeSessions, measurements, settings, strength] = await Promise.all([
    api.history(120),
    api.activeSessions(),
    api.measurements(),
    api.settings(),
    api.history1RM(),
  ]);
  return { history, activeSessions, measurements, settings, strength };
}

function HomeV2() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState("");
  const [deloadSaving, setDeloadSaving] = useState(false);

  const loadDashboard = useCallback(async () => {
    setError("");
    try {
      setDashboard(await fetchDashboard());
    } catch (loadError) {
      console.error("[HOME-V2] load failed", loadError);
      setError("Your training data could not be loaded. Check your connection and try again.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchDashboard()
      .then((data) => { if (!cancelled) setDashboard(data); })
      .catch((loadError) => {
        if (cancelled) return;
        console.error("[HOME-V2] load failed", loadError);
        setError("Your training data could not be loaded. Check your connection and try again.");
      });
    return () => { cancelled = true; };
  }, []);

  const view = useMemo(() => {
    if (!dashboard) return null;
    const { history, activeSessions, measurements, settings, strength } = dashboard;
    const deload = isDeloadActive(settings);
    const plan = parseWorkoutPlan(settings);

    const latestProgramSession = history.find((session) =>
      PROGRAM_ORDER.includes(normalizeWorkoutName(session.workout_name)),
    );
    const rotationName = latestProgramSession
      ? PROGRAM_ORDER[(PROGRAM_ORDER.indexOf(normalizeWorkoutName(latestProgramSession.workout_name)) + 1) % PROGRAM_ORDER.length]
      : PROGRAM_ORDER[0];
    const plannedName = plan.length ? normalizeWorkoutName(plan[0].workout) : null;
    const suggestedName = plannedName && PROGRAM_ORDER.includes(plannedName) ? plannedName : rotationName;
    let featured = PROGRAM.find((workout) => workout.name === suggestedName) || PROGRAM[0];

    const resumable = activeSessions.find((active) => {
      const workout = PROGRAM.find((candidate) => candidate.name === normalizeWorkoutName(active.workout_name));
      return workout && active.sets_done < expectedSetCount(workout, deload);
    });
    if (resumable) {
      featured = PROGRAM.find((workout) => workout.name === normalizeWorkoutName(resumable.workout_name)) || featured;
    }

    const recent = history
      .filter((session) => (session.sets || []).some((set) => set.reps))
      .slice(0, 6);
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - 6);
    const weekSessions = history.filter((session) =>
      (session.sets || []).some((set) => set.reps) && new Date(`${session.date}T12:00:00`) >= weekStart,
    );
    const weekSets = weekSessions.reduce(
      (total, session) => total + (session.sets || []).filter((set) => set.set_type === "working" && set.reps).length,
      0,
    );
    const weekVolume = weekSessions.reduce((total, session) => total + sessionVolume(session), 0);
    const lastMeasurement = measurements[0] || null;
    const bodyweight = lastMeasurement?.weight_kg
      ? `${lastMeasurement.weight_kg.toFixed(1)} kg`
      : settings.bodyweight
        ? `${settings.bodyweight} lb`
        : "—";
    const benchSeries = (strength.orm || {})["Barbell Bench Press"] || [];
    const latestBench = [...benchSeries].reverse().find((point) => !point.is_deload);

    return {
      history,
      settings,
      deload,
      plan,
      featured,
      resumable,
      recent,
      weekSessions,
      weekSets,
      weekVolume,
      bodyweight,
      latestMeasurement: lastMeasurement,
      latestBench,
      days: calendarDays(history),
    };
  }, [dashboard]);

  const toggleDeload = async () => {
    if (!dashboard || deloadSaving) return;
    const enabled = isDeloadActive(dashboard.settings);
    const update = enabled
      ? { deload_active: "0" }
      : { deload_active: "1", deload_started: localDate() };
    setDeloadSaving(true);
    setDashboard((current) => ({ ...current, settings: { ...current.settings, ...update } }));
    try {
      await api.saveSettings(update);
    } catch (saveError) {
      console.error("[HOME-V2] deload toggle failed", saveError);
      setError("Deload mode could not be updated.");
      await loadDashboard();
    } finally {
      setDeloadSaving(false);
    }
  };

  if (!dashboard && !error) return <LoadingState />;
  if (!view) {
    return (
      <main className={styles.page}>
        <div className={styles.errorCard}>
          <span>Connection interrupted</span>
          <p>{error}</p>
          <button type="button" onClick={() => void loadDashboard()}>Try again</button>
        </div>
      </main>
    );
  }

  const firstName = user?.displayName?.split(" ")[0] || "Egor";
  const featuredNames = workoutExerciseNames(view.featured);
  const featuredExpected = expectedSetCount(view.featured, view.deload);
  const progress = view.resumable
    ? Math.min(100, Math.round((view.resumable.sets_done / featuredExpected) * 100))
    : 0;

  return (
    <main className={styles.page}>
      <div className={styles.ambientOne} />
      <div className={styles.ambientTwo} />
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href="/v2" className={styles.brand} aria-label="Workout Do v2 home">
            <span className={styles.brandMark}>WD</span>
            <span>workout<span>.do</span></span>
            <small>V2</small>
          </Link>
          <nav className={styles.headerActions} aria-label="Home page options">
            <Link href="/" className={styles.textLink}>Original home</Link>
            <button type="button" className={styles.avatar} onClick={() => void signOut()} title="Sign out">
              {firstName.slice(0, 1).toUpperCase()}
            </button>
          </nav>
        </header>

        <section className={styles.intro}>
          <div>
            <p className={styles.eyebrow}>{formatDate(localDate(), { weekday: "long", month: "long", day: "numeric" })}</p>
            <h1>Training overview</h1>
          </div>
          <button
            type="button"
            className={`${styles.deloadToggle} ${view.deload ? styles.deloadActive : ""}`}
            onClick={() => void toggleDeload()}
            disabled={deloadSaving}
            aria-pressed={view.deload}
          >
            <span className={styles.toggleDot} />
            <span>
              <b>Deload</b>
              <small>{view.deload ? `${deloadDaysLeft(view.settings)} days left` : "Off"}</small>
            </span>
          </button>
        </section>

        {error && <div className={styles.inlineError}>{error}</div>}

        <section className={styles.dashboardGrid}>
          <div className={styles.primaryColumn}>
            <article className={`${styles.featureCard} ${view.featured.kind === "micro" ? styles.microFeature : ""}`}>
              <div className={styles.featureTopline}>
                <span className={styles.pill}>{view.resumable ? "Session in progress" : view.plan.length ? "Up next · planned" : "Up next"}</span>
                <span className={styles.duration}>≈ {Math.round(estimateTemplateWorkoutDuration(view.featured) / 60)} min</span>
              </div>
              <div className={styles.featureBody}>
                <div>
                  <p className={styles.workoutType}>{view.featured.kind === "micro" ? "Micro session" : "Main session"}</p>
                  <h2>{view.featured.name.replace(/^(Main|Micro):\s*/, "")}</h2>
                  {view.plan[0]?.note && <p className={styles.featureNote}>{view.plan[0].note}</p>}
                </div>
                <Link href={`/v2/session?w=${view.featured.id}`} className={styles.startButton}>
                  <span>{view.resumable ? "Resume" : "Start workout"}</span>
                  <span aria-hidden>↗</span>
                </Link>
              </div>
              <div className={styles.exerciseRail}>
                {featuredNames.slice(0, 5).map((name, index) => (
                  <span key={name}><b>{String(index + 1).padStart(2, "0")}</b>{name}</span>
                ))}
              </div>
              {view.resumable && (
                <div className={styles.progressWrap}>
                  <div><span>{view.resumable.sets_done} of {featuredExpected} sets</span><b>{progress}%</b></div>
                  <div className={styles.progressTrack}><span style={{ width: `${progress}%` }} /></div>
                </div>
              )}
            </article>

            <section className={styles.sectionBlock}>
              <div className={styles.sectionHeading}>
                <div><p>Program</p><h2>The rotation</h2></div>
                <span>4 sessions</span>
              </div>
              <div className={styles.programGrid}>
                {PROGRAM.map((workout, index) => {
                  const isFeatured = workout.id === view.featured.id;
                  return (
                    <Link
                      href={`/v2/session?w=${workout.id}`}
                      key={workout.id}
                      className={`${styles.programCard} ${isFeatured ? styles.programCardActive : ""}`}
                    >
                      <div><span>0{index + 1}</span><small>{workout.kind}</small></div>
                      <h3>{workout.name.replace(/^(Main|Micro):\s*/, "")}</h3>
                      <p>{workoutExerciseNames(workout).slice(0, 3).join(" · ")}</p>
                      <footer><span>{Math.round(estimateTemplateWorkoutDuration(workout) / 60)} min</span><b>→</b></footer>
                    </Link>
                  );
                })}
              </div>
            </section>

            <section className={styles.sectionBlock}>
              <div className={styles.sectionHeading}>
                <div><p>History</p><h2>Recent work</h2></div>
                <span>{view.recent.length} sessions</span>
              </div>
              <div className={styles.historyList}>
                {view.recent.length ? view.recent.map((session) => {
                  const workSets = (session.sets || []).filter((set) => set.set_type === "working" && set.reps).length;
                  return (
                    <div className={styles.historyRow} key={session.id}>
                      <div className={styles.historyDate}>
                        <b>{formatDate(session.date, { day: "2-digit" })}</b>
                        <span>{formatDate(session.date, { month: "short" })}</span>
                      </div>
                      <div className={styles.historyName}>
                        <strong>{normalizeWorkoutName(session.workout_name)}</strong>
                        <span>{workSets} working sets · {formatDuration(session.duration_sec)}</span>
                      </div>
                      {session.is_deload ? <span className={styles.deloadBadge}>Deload</span> : <span className={styles.check}>✓</span>}
                    </div>
                  );
                }) : <div className={styles.emptyState}>No completed sessions.</div>}
              </div>
            </section>
          </div>

          <aside className={styles.sideColumn}>
            <section className={styles.statCard}>
              <div className={styles.sectionHeadingCompact}><p>Last 7 days</p><span>Live</span></div>
              <div className={styles.statHero}><strong>{view.weekSessions.length}</strong><span>sessions</span></div>
              <div className={styles.statTriplet}>
                <div><b>{view.weekSets}</b><span>work sets</span></div>
                <div><b>{Math.round(view.weekVolume / 1000)}k</b><span>lb volume</span></div>
                <div><b>{view.latestBench ? Math.round(view.latestBench.orm) : "—"}</b><span>bench e1RM</span></div>
              </div>
            </section>

            <section className={styles.consistencyCard}>
              <div className={styles.sectionHeadingCompact}><p>Consistency</p><span>14 days</span></div>
              <div className={styles.dayGrid}>
                {view.days.map((day) => (
                  <div key={day.key} className={`${styles.dayCell} ${day.count ? styles.dayDone : ""} ${day.deload ? styles.dayDeload : ""} ${day.isToday ? styles.dayToday : ""}`}>
                    <span>{day.label}</span><b>{day.day}</b><i />
                  </div>
                ))}
              </div>
            </section>

            <section className={styles.bodyCard}>
              <div className={styles.sectionHeadingCompact}><p>Body</p><span>{view.latestMeasurement ? formatDate(view.latestMeasurement.date, { month: "short", day: "numeric" }) : "Latest"}</span></div>
              <div className={styles.bodyweight}><strong>{view.bodyweight}</strong><span>Bodyweight</span></div>
              <div className={styles.bodyMetrics}>
                <div><span>Chest</span><b>{view.latestMeasurement?.chest_cm?.toFixed(1) || "—"}<small> cm</small></b></div>
                <div><span>Waist</span><b>{view.latestMeasurement?.waist_cm?.toFixed(1) || "—"}<small> cm</small></b></div>
                <div><span>Arm</span><b>{view.latestMeasurement?.l_arm_cm?.toFixed(1) || "—"}<small> cm</small></b></div>
              </div>
              <Link href="/" className={styles.manageLink}>Open original home <span>→</span></Link>
            </section>

            {view.plan.length > 0 && (
              <section className={styles.planCard}>
                <div className={styles.sectionHeadingCompact}><p>Plan queue</p><span>{view.plan.length}</span></div>
                <ol>
                  {view.plan.slice(0, 3).map((entry, index) => (
                    <li key={entry.id || `${entry.workout}-${index}`}>
                      <span>{index + 1}</span><div><b>{normalizeWorkoutName(entry.workout)}</b>{entry.note && <small>{entry.note}</small>}</div>
                    </li>
                  ))}
                </ol>
                <Link href="/" className={styles.manageLink}>Edit on original home <span>→</span></Link>
              </section>
            )}
          </aside>
        </section>

        <footer className={styles.footer}>
          <span>Workout Do · Home v2 preview</span>
          <div>{PROGRAM.map((workout) => <Link key={workout.id} href={`/v2/session?w=${workout.id}&test=1`}>{workout.name.replace(/^(Main|Micro):\s*/, "")}</Link>)}</div>
        </footer>
      </div>
    </main>
  );
}

function LoadingState() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}><div className={styles.skeletonBrand} /><div className={styles.skeletonAvatar} /></header>
        <div className={styles.loadingIntro}><i /><i /><i /></div>
        <div className={styles.loadingGrid}><div /><aside><i /><i /><i /></aside></div>
      </div>
    </main>
  );
}

export default HomeV2;
