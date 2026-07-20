// =============================================================================
// Chapter 02 — User Research (barrel)
// =============================================================================

export type {
  Recruit,
  StudyDesign,
  Observation,
  SurveyResponse,
} from './models.js';

export {
  buildScreener,
  screen,
  stratifiedSample,
  sampleSizeForProportion,
  saturationPoint,
} from './recruitment.js';
export type { ScreenQuestion } from './recruitment.js';

export {
  defaultInterviewGuide,
  sentimentBreakdown,
  themeFrequencies,
  cohensKappa,
  synthesizePersonas,
} from './interview.js';
export type { InterviewPhase, ScriptedQuestion, Persona } from './interview.js';

export {
  scoreLikert,
  susScore,
  nps,
  cronbachsAlpha,
  worstDropOff,
} from './survey.js';
export type { LikertItem, NpsResult } from './survey.js';

export {
  describe,
  normalCdf,
  twoProportionZ,
  betaPosterior,
  probabilityBBeatsA,
} from './quant.js';
export type { DescriptiveStats, ABTest, ABResult } from './quant.js';

export { demo } from './demo.js';
