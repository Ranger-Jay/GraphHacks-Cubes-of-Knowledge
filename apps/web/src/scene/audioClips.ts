import type { AgentId } from '@cubes/contracts';
import type { ExpressionId, VisemeFrame } from './types';

export type AudioClipKind = 'ordinary' | 'outage' | 'recovery';
export type AudioClipRole =
  | 'greeting'
  | 'help'
  | 'yes'
  | 'no'
  | 'task_start_a'
  | 'task_start_b'
  | 'task_start_c'
  | 'task_optional'
  | 'outage'
  | 'reconnect_check'
  | 'ready';

export interface AudioClip {
  file: string;
  agent: AgentId;
  kind: AudioClipKind;
  role: AudioClipRole;
  transcript: string;
  durationMs: number;
  sha256: string;
  expression: ExpressionId;
  visemes: VisemeFrame[];
}

/** Accepted viseme/timing pin fce5110d89658f0e8c813d74dad7e3ba0e996896 */
export const AUDIO_CLIPS: readonly AudioClip[] = [
  {
    file: "ava_01_greeting_v001.wav",
    agent: "ava",
    kind: "ordinary",
    role: "greeting",
    transcript: "Greetings, Commander",
    durationMs: 1985,
    sha256: "f570f51a81a6f818592c6fab123e668ab0ca7e133080d13e0900ab5f8a3e47ee",
    expression: "smile",
    visemes: [{"timeMs": 0, "viseme": "rest"}, {"timeMs": 100, "viseme": "viseme_narrow"}, {"timeMs": 279, "viseme": "viseme_open"}, {"timeMs": 457, "viseme": "viseme_narrow"}, {"timeMs": 636, "viseme": "rest"}, {"timeMs": 814, "viseme": "viseme_round"}, {"timeMs": 993, "viseme": "viseme_open"}, {"timeMs": 1171, "viseme": "viseme_narrow"}, {"timeMs": 1350, "viseme": "smile"}, {"timeMs": 1985, "viseme": "rest"}] as VisemeFrame[],
  },
  {
    file: "ava_02_help_v001.wav",
    agent: "ava",
    kind: "ordinary",
    role: "help",
    transcript: "how may I help",
    durationMs: 1776,
    sha256: "a2fe2e2686a7d82b40399000d3b76a3586e3e7dd43d3f30cc707150e0bb8e585",
    expression: "attentive",
    visemes: [{"timeMs": 0, "viseme": "rest"}, {"timeMs": 200, "viseme": "viseme_open"}, {"timeMs": 350, "viseme": "viseme_open"}, {"timeMs": 500, "viseme": "viseme_narrow"}, {"timeMs": 650, "viseme": "viseme_open"}, {"timeMs": 800, "viseme": "viseme_narrow"}, {"timeMs": 950, "viseme": "rest"}, {"timeMs": 1776, "viseme": "rest"}] as VisemeFrame[],
  },
  {
    file: "ava_03_yes_v001.wav",
    agent: "ava",
    kind: "ordinary",
    role: "yes",
    transcript: "yes",
    durationMs: 1097,
    sha256: "f23f47d63a2cff9386c54f06b58ff12c058d64daa04554fedc94e709eaf636ce",
    expression: "nod",
    visemes: [{"timeMs": 0, "viseme": "rest"}, {"timeMs": 100, "viseme": "viseme_narrow"}, {"timeMs": 167, "viseme": "viseme_open"}, {"timeMs": 233, "viseme": "viseme_narrow"}, {"timeMs": 300, "viseme": "rest"}, {"timeMs": 1097, "viseme": "rest"}] as VisemeFrame[],
  },
  {
    file: "ava_04_no_v001.wav",
    agent: "ava",
    kind: "ordinary",
    role: "no",
    transcript: "no",
    durationMs: 1045,
    sha256: "df019c1d8ee42e173531d07543bc8eedaca0921132a00d0d490f58527dcd3445",
    expression: "shake",
    visemes: [{"timeMs": 0, "viseme": "rest"}, {"timeMs": 200, "viseme": "viseme_narrow"}, {"timeMs": 350, "viseme": "viseme_round"}, {"timeMs": 500, "viseme": "rest"}, {"timeMs": 1045, "viseme": "rest"}] as VisemeFrame[],
  },
  {
    file: "ava_05_task_start_a_v001.wav",
    agent: "ava",
    kind: "ordinary",
    role: "task_start_a",
    transcript: "I'll get right on it.",
    durationMs: 1933,
    sha256: "bea4368f7c1accc3a959ce58e0f597809bcb60f303775014ed4dfe055d61b8d0",
    expression: "focused",
    visemes: [{"timeMs": 0, "viseme": "rest"}, {"timeMs": 150, "viseme": "viseme_narrow"}, {"timeMs": 325, "viseme": "viseme_open"}, {"timeMs": 500, "viseme": "viseme_open"}, {"timeMs": 675, "viseme": "viseme_narrow"}, {"timeMs": 850, "viseme": "viseme_round"}, {"timeMs": 1025, "viseme": "viseme_narrow"}, {"timeMs": 1200, "viseme": "rest"}, {"timeMs": 1933, "viseme": "rest"}] as VisemeFrame[],
  },
  {
    file: "ava_06_task_start_b_v001.wav",
    agent: "ava",
    kind: "ordinary",
    role: "task_start_b",
    transcript: "Task beginning",
    durationMs: 1855,
    sha256: "4240df0405aa58995c43e057b84d2f9f060ca3b6d4edcfa26ca8b9e152ee5cb4",
    expression: "focused",
    visemes: [{"timeMs": 0, "viseme": "rest"}, {"timeMs": 250, "viseme": "viseme_open"}, {"timeMs": 470, "viseme": "viseme_narrow"}, {"timeMs": 690, "viseme": "viseme_narrow"}, {"timeMs": 910, "viseme": "viseme_open"}, {"timeMs": 1130, "viseme": "viseme_narrow"}, {"timeMs": 1350, "viseme": "rest"}, {"timeMs": 1855, "viseme": "rest"}] as VisemeFrame[],
  },
  {
    file: "ava_07_task_start_c_v001.wav",
    agent: "ava",
    kind: "ordinary",
    role: "task_start_c",
    transcript: "Underway.",
    durationMs: 1750,
    sha256: "870b1592d4de77bcf93c6d1df57b4cb69a25272895e6a88eb8284dd897aab05d",
    expression: "focused",
    visemes: [{"timeMs": 0, "viseme": "rest"}, {"timeMs": 150, "viseme": "viseme_round"}, {"timeMs": 483, "viseme": "viseme_narrow"}, {"timeMs": 817, "viseme": "viseme_open"}, {"timeMs": 1150, "viseme": "rest"}, {"timeMs": 1750, "viseme": "rest"}] as VisemeFrame[],
  },
  {
    file: "ava_08_task_optional_v001.wav",
    agent: "ava",
    kind: "ordinary",
    role: "task_optional",
    transcript: "On it.",
    durationMs: 1149,
    sha256: "b04a72ca2c1bf32ca2f3d9d5a95857c2998d376e42689a5a0e5032f4e2f582e3",
    expression: "focused",
    visemes: [{"timeMs": 0, "viseme": "rest"}, {"timeMs": 50, "viseme": "viseme_round"}, {"timeMs": 250, "viseme": "viseme_narrow"}, {"timeMs": 450, "viseme": "rest"}, {"timeMs": 1149, "viseme": "rest"}] as VisemeFrame[],
  },
  {
    file: "ava_09_outage_v002.wav",
    agent: "ava",
    kind: "outage",
    role: "outage",
    transcript: "I can’t access the company’s knowledge. Information is unavailable until FalkorDB is available again.",
    durationMs: 10266,
    sha256: "48c5ef55de1c9c2f514064e2ab8098e3b98f9e5a2cd0caa3d708bfddd9cee343",
    expression: "attentive",
    visemes: [{"timeMs": 0, "viseme": "rest"}, {"timeMs": 150, "viseme": "viseme_open"}, {"timeMs": 450, "viseme": "rest"}, {"timeMs": 1450, "viseme": "viseme_open"}, {"timeMs": 1750, "viseme": "viseme_narrow"}, {"timeMs": 2100, "viseme": "viseme_open"}, {"timeMs": 2450, "viseme": "viseme_narrow"}, {"timeMs": 2750, "viseme": "viseme_round"}, {"timeMs": 3100, "viseme": "viseme_open"}, {"timeMs": 3400, "viseme": "viseme_narrow"}, {"timeMs": 3750, "viseme": "rest"}, {"timeMs": 5100, "viseme": "viseme_open"}, {"timeMs": 5500, "viseme": "viseme_round"}, {"timeMs": 6050, "viseme": "viseme_open"}, {"timeMs": 6350, "viseme": "viseme_open"}, {"timeMs": 6650, "viseme": "viseme_narrow"}, {"timeMs": 7250, "viseme": "viseme_open"}, {"timeMs": 7550, "viseme": "viseme_open"}, {"timeMs": 7800, "viseme": "viseme_round"}, {"timeMs": 8150, "viseme": "viseme_narrow"}, {"timeMs": 8550, "viseme": "viseme_open"}, {"timeMs": 8950, "viseme": "viseme_narrow"}, {"timeMs": 9400, "viseme": "viseme_open"}, {"timeMs": 9750, "viseme": "rest"}, {"timeMs": 10266, "viseme": "rest"}] as VisemeFrame[],
  },
  {
    file: "ava_10_reconnect_check_v001.wav",
    agent: "ava",
    kind: "recovery",
    role: "reconnect_check",
    transcript: "Connection restored. Checking the latest company records.",
    durationMs: 5825,
    sha256: "bebc31b2877be1cc3240e631c5180f56e94cd0ad8bc2761f9fb014d4f9c9a46e",
    expression: "smile",
    visemes: [{"timeMs": 0, "viseme": "rest"}, {"timeMs": 350, "viseme": "viseme_round"}, {"timeMs": 667, "viseme": "viseme_open"}, {"timeMs": 983, "viseme": "viseme_narrow"}, {"timeMs": 1300, "viseme": "viseme_narrow"}, {"timeMs": 1617, "viseme": "viseme_round"}, {"timeMs": 1933, "viseme": "viseme_open"}, {"timeMs": 2250, "viseme": "viseme_narrow"}, {"timeMs": 2567, "viseme": "viseme_narrow"}, {"timeMs": 2883, "viseme": "viseme_open"}, {"timeMs": 3200, "viseme": "viseme_narrow"}, {"timeMs": 3517, "viseme": "viseme_round"}, {"timeMs": 3833, "viseme": "viseme_open"}, {"timeMs": 4150, "viseme": "viseme_narrow"}, {"timeMs": 4467, "viseme": "viseme_narrow"}, {"timeMs": 4783, "viseme": "viseme_round"}, {"timeMs": 5100, "viseme": "smile"}, {"timeMs": 5825, "viseme": "rest"}] as VisemeFrame[],
  },
  {
    file: "guz_01_greeting_v001.wav",
    agent: "guz",
    kind: "ordinary",
    role: "greeting",
    transcript: "Greetings, Commander",
    durationMs: 2612,
    sha256: "71131014baf2bb692f8fb817c6727256e6d0be295ecfea23ba9c9631f2d5b8ca",
    expression: "smile",
    visemes: [{"timeMs": 0, "viseme": "rest"}, {"timeMs": 150, "viseme": "viseme_narrow"}, {"timeMs": 414, "viseme": "viseme_open"}, {"timeMs": 679, "viseme": "viseme_narrow"}, {"timeMs": 943, "viseme": "rest"}, {"timeMs": 1207, "viseme": "viseme_round"}, {"timeMs": 1471, "viseme": "viseme_open"}, {"timeMs": 1736, "viseme": "viseme_narrow"}, {"timeMs": 2000, "viseme": "smile"}, {"timeMs": 2612, "viseme": "rest"}] as VisemeFrame[],
  },
  {
    file: "guz_02_help_v001.wav",
    agent: "guz",
    kind: "ordinary",
    role: "help",
    transcript: "how may I help",
    durationMs: 3187,
    sha256: "e017c10ccec99483e2f9489be55964e2d40745ddfecd0f4ed1416dd56fd83354",
    expression: "attentive",
    visemes: [{"timeMs": 0, "viseme": "rest"}, {"timeMs": 200, "viseme": "viseme_open"}, {"timeMs": 660, "viseme": "viseme_open"}, {"timeMs": 1120, "viseme": "viseme_narrow"}, {"timeMs": 1580, "viseme": "viseme_open"}, {"timeMs": 2040, "viseme": "viseme_narrow"}, {"timeMs": 2500, "viseme": "rest"}, {"timeMs": 3187, "viseme": "rest"}] as VisemeFrame[],
  },
  {
    file: "guz_03_yes_v001.wav",
    agent: "guz",
    kind: "ordinary",
    role: "yes",
    transcript: "yes",
    durationMs: 1620,
    sha256: "bc0f6205aafff425426d5029df169d4ab8bb8dae8e8057490b364fd366c16c78",
    expression: "nod",
    visemes: [{"timeMs": 0, "viseme": "rest"}, {"timeMs": 150, "viseme": "viseme_narrow"}, {"timeMs": 450, "viseme": "viseme_open"}, {"timeMs": 750, "viseme": "viseme_narrow"}, {"timeMs": 1050, "viseme": "rest"}, {"timeMs": 1620, "viseme": "rest"}] as VisemeFrame[],
  },
  {
    file: "guz_04_no_v001.wav",
    agent: "guz",
    kind: "ordinary",
    role: "no",
    transcript: "no",
    durationMs: 1437,
    sha256: "b0208a51a3da6cdcdf7d96c184c51aaa8c23d597fa5a670eda34ae261f6f2c90",
    expression: "shake",
    visemes: [{"timeMs": 0, "viseme": "rest"}, {"timeMs": 0, "viseme": "viseme_narrow"}, {"timeMs": 375, "viseme": "viseme_round"}, {"timeMs": 750, "viseme": "rest"}, {"timeMs": 1437, "viseme": "rest"}] as VisemeFrame[],
  },
  {
    file: "guz_05_task_start_a_v001.wav",
    agent: "guz",
    kind: "ordinary",
    role: "task_start_a",
    transcript: "I'll get right on it.",
    durationMs: 2743,
    sha256: "732f92b1dd7ae185f0bfe7835317762d3f7c4873e691f0fb8d4e8189fe37ef6b",
    expression: "focused",
    visemes: [{"timeMs": 0, "viseme": "rest"}, {"timeMs": 100, "viseme": "viseme_narrow"}, {"timeMs": 442, "viseme": "viseme_open"}, {"timeMs": 783, "viseme": "viseme_open"}, {"timeMs": 1125, "viseme": "viseme_narrow"}, {"timeMs": 1467, "viseme": "viseme_round"}, {"timeMs": 1808, "viseme": "viseme_narrow"}, {"timeMs": 2150, "viseme": "rest"}, {"timeMs": 2743, "viseme": "rest"}] as VisemeFrame[],
  },
  {
    file: "guz_06_task_start_b_v001.wav",
    agent: "guz",
    kind: "ordinary",
    role: "task_start_b",
    transcript: "Task beginning",
    durationMs: 1959,
    sha256: "a6471368b13327ff29562b658c32b5678e10b14c1d24474159dcbe976fde43c4",
    expression: "focused",
    visemes: [{"timeMs": 0, "viseme": "rest"}, {"timeMs": 100, "viseme": "viseme_open"}, {"timeMs": 350, "viseme": "viseme_narrow"}, {"timeMs": 600, "viseme": "viseme_narrow"}, {"timeMs": 850, "viseme": "viseme_open"}, {"timeMs": 1100, "viseme": "viseme_narrow"}, {"timeMs": 1350, "viseme": "rest"}, {"timeMs": 1959, "viseme": "rest"}] as VisemeFrame[],
  },
  {
    file: "guz_07_task_start_c_v001.wav",
    agent: "guz",
    kind: "ordinary",
    role: "task_start_c",
    transcript: "Underway.",
    durationMs: 1567,
    sha256: "0ede56c21f77583f3ad61ade7e9e6484bae60a7f081b1b006c47ef3413be32f5",
    expression: "focused",
    visemes: [{"timeMs": 0, "viseme": "rest"}, {"timeMs": 150, "viseme": "viseme_round"}, {"timeMs": 417, "viseme": "viseme_narrow"}, {"timeMs": 683, "viseme": "viseme_open"}, {"timeMs": 950, "viseme": "rest"}, {"timeMs": 1567, "viseme": "rest"}] as VisemeFrame[],
  },
  {
    file: "guz_08_task_optional_v001.wav",
    agent: "guz",
    kind: "ordinary",
    role: "task_optional",
    transcript: "On it.",
    durationMs: 1332,
    sha256: "1f564bbe3ce7ca49350e8be5ca659f3ebb0f082c879193350071c43b4246df26",
    expression: "focused",
    visemes: [{"timeMs": 0, "viseme": "rest"}, {"timeMs": 150, "viseme": "viseme_round"}, {"timeMs": 350, "viseme": "viseme_narrow"}, {"timeMs": 550, "viseme": "rest"}, {"timeMs": 1332, "viseme": "rest"}] as VisemeFrame[],
  },
  {
    file: "guz_09_outage_v002.wav",
    agent: "guz",
    kind: "outage",
    role: "outage",
    transcript: "I can’t verify any sources. I will not provide an answer without evidence.",
    durationMs: 7105,
    sha256: "0f98d5c171702812cee341cd2b56ba3a8501adc143b34befb2123144fa549487",
    expression: "focused",
    visemes: [{"timeMs": 0, "viseme": "rest"}, {"timeMs": 300, "viseme": "viseme_open"}, {"timeMs": 550, "viseme": "viseme_narrow"}, {"timeMs": 850, "viseme": "viseme_open"}, {"timeMs": 1200, "viseme": "viseme_narrow"}, {"timeMs": 1450, "viseme": "viseme_open"}, {"timeMs": 1750, "viseme": "viseme_round"}, {"timeMs": 2250, "viseme": "rest"}, {"timeMs": 3150, "viseme": "viseme_open"}, {"timeMs": 3450, "viseme": "viseme_narrow"}, {"timeMs": 3750, "viseme": "viseme_round"}, {"timeMs": 4100, "viseme": "viseme_open"}, {"timeMs": 4500, "viseme": "viseme_open"}, {"timeMs": 4800, "viseme": "viseme_narrow"}, {"timeMs": 5200, "viseme": "viseme_round"}, {"timeMs": 5500, "viseme": "viseme_open"}, {"timeMs": 5950, "viseme": "rest"}, {"timeMs": 7105, "viseme": "rest"}] as VisemeFrame[],
  },
  {
    file: "roy_01_greeting_v001.wav",
    agent: "roy",
    kind: "ordinary",
    role: "greeting",
    transcript: "Greetings, Commander",
    durationMs: 1698,
    sha256: "c7b98e1e0f7c29a9c7f00e7acf4fc712a3bb150f70799aca0a793a53c6c194ad",
    expression: "smile",
    visemes: [{"timeMs": 0, "viseme": "rest"}, {"timeMs": 0, "viseme": "viseme_narrow"}, {"timeMs": 171, "viseme": "viseme_open"}, {"timeMs": 343, "viseme": "viseme_narrow"}, {"timeMs": 514, "viseme": "rest"}, {"timeMs": 686, "viseme": "viseme_round"}, {"timeMs": 857, "viseme": "viseme_open"}, {"timeMs": 1029, "viseme": "viseme_narrow"}, {"timeMs": 1200, "viseme": "smile"}, {"timeMs": 1698, "viseme": "rest"}] as VisemeFrame[],
  },
  {
    file: "roy_02_help_v001.wav",
    agent: "roy",
    kind: "ordinary",
    role: "help",
    transcript: "how may I help",
    durationMs: 2038,
    sha256: "a0482a2f0a457e03fe3eabf2dd0ce310fbef53eb6ce5a830ccb8733976477d65",
    expression: "attentive",
    visemes: [{"timeMs": 0, "viseme": "rest"}, {"timeMs": 200, "viseme": "viseme_open"}, {"timeMs": 400, "viseme": "viseme_open"}, {"timeMs": 600, "viseme": "viseme_narrow"}, {"timeMs": 800, "viseme": "viseme_open"}, {"timeMs": 1000, "viseme": "viseme_narrow"}, {"timeMs": 1200, "viseme": "rest"}, {"timeMs": 2038, "viseme": "rest"}] as VisemeFrame[],
  },
  {
    file: "roy_03_yes_v001.wav",
    agent: "roy",
    kind: "ordinary",
    role: "yes",
    transcript: "yes",
    durationMs: 1202,
    sha256: "214bf0dfbd5425ba0a6984511b76c48363aacd47614e9a59c73715dc96750d89",
    expression: "nod",
    visemes: [{"timeMs": 0, "viseme": "rest"}, {"timeMs": 200, "viseme": "viseme_narrow"}, {"timeMs": 333, "viseme": "viseme_open"}, {"timeMs": 467, "viseme": "viseme_narrow"}, {"timeMs": 600, "viseme": "rest"}, {"timeMs": 1202, "viseme": "rest"}] as VisemeFrame[],
  },
  {
    file: "roy_04_no_v001.wav",
    agent: "roy",
    kind: "ordinary",
    role: "no",
    transcript: "no",
    durationMs: 1463,
    sha256: "8a85ded29b6291f6a19776b53a9f1ace80b9874b951f2e4cb26d7149f08f831c",
    expression: "shake",
    visemes: [{"timeMs": 0, "viseme": "rest"}, {"timeMs": 150, "viseme": "viseme_narrow"}, {"timeMs": 275, "viseme": "viseme_round"}, {"timeMs": 400, "viseme": "rest"}, {"timeMs": 1463, "viseme": "rest"}] as VisemeFrame[],
  },
  {
    file: "roy_05_task_start_a_v001.wav",
    agent: "roy",
    kind: "ordinary",
    role: "task_start_a",
    transcript: "I'll get right on it.",
    durationMs: 2142,
    sha256: "1d9d657ea84db8b42746119a5d6fa0704b3b99181036401f10c2d3edbeb49681",
    expression: "focused",
    visemes: [{"timeMs": 0, "viseme": "rest"}, {"timeMs": 100, "viseme": "viseme_narrow"}, {"timeMs": 300, "viseme": "viseme_open"}, {"timeMs": 500, "viseme": "viseme_open"}, {"timeMs": 700, "viseme": "viseme_narrow"}, {"timeMs": 900, "viseme": "viseme_round"}, {"timeMs": 1100, "viseme": "viseme_narrow"}, {"timeMs": 1300, "viseme": "rest"}, {"timeMs": 2142, "viseme": "rest"}] as VisemeFrame[],
  },
  {
    file: "roy_06_task_start_b_v001.wav",
    agent: "roy",
    kind: "ordinary",
    role: "task_start_b",
    transcript: "Task beginning",
    durationMs: 1802,
    sha256: "4553210c26f00b6192f03a1bc9c083ccea2571cac718ee7c53a641b0d99ef8d7",
    expression: "focused",
    visemes: [{"timeMs": 0, "viseme": "rest"}, {"timeMs": 150, "viseme": "viseme_open"}, {"timeMs": 400, "viseme": "viseme_narrow"}, {"timeMs": 650, "viseme": "viseme_narrow"}, {"timeMs": 900, "viseme": "viseme_open"}, {"timeMs": 1150, "viseme": "viseme_narrow"}, {"timeMs": 1400, "viseme": "rest"}, {"timeMs": 1802, "viseme": "rest"}] as VisemeFrame[],
  },
  {
    file: "roy_07_task_start_c_v001.wav",
    agent: "roy",
    kind: "ordinary",
    role: "task_start_c",
    transcript: "Underway.",
    durationMs: 1306,
    sha256: "b682faba810ed15a9f14bf002010654774d9e24d737f60c2fd9d8e987805a681",
    expression: "focused",
    visemes: [{"timeMs": 0, "viseme": "rest"}, {"timeMs": 100, "viseme": "viseme_round"}, {"timeMs": 267, "viseme": "viseme_narrow"}, {"timeMs": 433, "viseme": "viseme_open"}, {"timeMs": 600, "viseme": "rest"}, {"timeMs": 1306, "viseme": "rest"}] as VisemeFrame[],
  },
  {
    file: "roy_08_task_optional_v001.wav",
    agent: "roy",
    kind: "ordinary",
    role: "task_optional",
    transcript: "On it.",
    durationMs: 1202,
    sha256: "77b8699abb540554984b0fe4f3f014bda24b8a1ca2e81b86f8dd41078ca06288",
    expression: "focused",
    visemes: [{"timeMs": 0, "viseme": "rest"}, {"timeMs": 100, "viseme": "viseme_round"}, {"timeMs": 300, "viseme": "viseme_narrow"}, {"timeMs": 500, "viseme": "rest"}, {"timeMs": 1202, "viseme": "rest"}] as VisemeFrame[],
  },
  {
    file: "roy_09_outage_v002.wav",
    agent: "roy",
    kind: "outage",
    role: "outage",
    transcript: "FalkorDB is unavailable. Operations are offline.",
    durationMs: 8098,
    sha256: "2c32039eeeebeceb95e6b58121f5ee0220f18e9bd56176a8d40904b45f271f6a",
    expression: "focused",
    visemes: [{"timeMs": 0, "viseme": "rest"}, {"timeMs": 100, "viseme": "viseme_open"}, {"timeMs": 450, "viseme": "viseme_round"}, {"timeMs": 800, "viseme": "viseme_narrow"}, {"timeMs": 1100, "viseme": "viseme_narrow"}, {"timeMs": 1400, "viseme": "viseme_open"}, {"timeMs": 1750, "viseme": "viseme_narrow"}, {"timeMs": 2050, "viseme": "rest"}, {"timeMs": 4400, "viseme": "viseme_round"}, {"timeMs": 4800, "viseme": "viseme_open"}, {"timeMs": 5350, "viseme": "rest"}, {"timeMs": 6000, "viseme": "viseme_narrow"}, {"timeMs": 6350, "viseme": "rest"}, {"timeMs": 6950, "viseme": "viseme_round"}, {"timeMs": 7300, "viseme": "viseme_open"}, {"timeMs": 7600, "viseme": "rest"}, {"timeMs": 8098, "viseme": "rest"}] as VisemeFrame[],
  },
  {
    file: "roy_10_ready_v001.wav",
    agent: "roy",
    kind: "recovery",
    role: "ready",
    transcript: "Current information loaded. Ready for your request.",
    durationMs: 4180,
    sha256: "1038db8fac740a432aafe97fcbac5396e2d3718091d222d1afdb08bec3ebfa78",
    expression: "smile",
    visemes: [{"timeMs": 0, "viseme": "rest"}, {"timeMs": 50, "viseme": "viseme_round"}, {"timeMs": 275, "viseme": "viseme_narrow"}, {"timeMs": 500, "viseme": "viseme_narrow"}, {"timeMs": 725, "viseme": "viseme_round"}, {"timeMs": 950, "viseme": "viseme_open"}, {"timeMs": 1175, "viseme": "viseme_narrow"}, {"timeMs": 1400, "viseme": "viseme_round"}, {"timeMs": 1625, "viseme": "viseme_narrow"}, {"timeMs": 1850, "viseme": "viseme_open"}, {"timeMs": 2075, "viseme": "viseme_narrow"}, {"timeMs": 2300, "viseme": "viseme_round"}, {"timeMs": 2525, "viseme": "viseme_round"}, {"timeMs": 2750, "viseme": "viseme_narrow"}, {"timeMs": 2975, "viseme": "viseme_open"}, {"timeMs": 3200, "viseme": "smile"}, {"timeMs": 4180, "viseme": "rest"}] as VisemeFrame[],
  },
] as const;

export const AUDIO_BASE_PATH = '/art/audio';

export function normalizeTranscript(text: string): string {
  return text.replace(/[\u2018\u2019\u201B\u0060]/g, "'").replace(/[\u201C\u201D]/g, '"').trim();
}

export function findClipByFile(file: string): AudioClip | undefined {
  return AUDIO_CLIPS.find((c) => c.file === file);
}

export function findClipByAgentRole(agent: AgentId, role: AudioClipRole): AudioClip | undefined {
  return AUDIO_CLIPS.find((c) => c.agent === agent && c.role === role);
}

export function findClipByAgentTranscript(agent: AgentId, phrase: string): AudioClip | undefined {
  const want = normalizeTranscript(phrase);
  return AUDIO_CLIPS.find((c) => c.agent === agent && normalizeTranscript(c.transcript) === want);
}

export function outageTranscript(agent: AgentId): string {
  const clip = findClipByAgentRole(agent, 'outage');
  if (!clip) throw new Error(`Missing outage clip for ${agent}`);
  return clip.transcript;
}

