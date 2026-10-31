import classes from './SplashScreen.module.css';

/** Full-viewport brand splash while the shell waits for setup, session or module remotes. */
export function SplashScreen() {
  return (
    <div className={classes.splash} role="status" aria-busy="true" aria-label="f.orga">
      <div className={classes.mark}>
        <span className={classes.glow} aria-hidden />
        <span className={classes.ring} aria-hidden />
        <img className={classes.logo} src="/logo-full.svg" alt="f.orga" width={120} height={140} />
      </div>
    </div>
  );
}
