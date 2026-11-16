// Public application boundary for feature modules. The existing UI is migrated
// incrementally so active lesson data remains compatible throughout the change.
import * as theory from './music/theory.js';
import * as tabModel from './music/tab-model.js';
import * as scoreDocument from './music/score-document.js';
import { storage } from './core/storage.js';
import * as audio from './core/audio.js';
import { createCommandHistory } from './core/command-history.js';
import { createDebouncedWriter } from './core/debounced-writer.js';
import { createRenderScheduler } from './features/tab/render-scheduler.js';
import { bindTabKeyboard } from './features/tab/keyboard-input.js';
import { createTabPlayback } from './features/tab/playback.js';

window.GuitarTool = Object.freeze({ theory, tabModel, scoreDocument, storage, audio, createCommandHistory, createDebouncedWriter, createRenderScheduler, bindTabKeyboard, createTabPlayback });
