// Public application boundary for feature modules. The existing UI is migrated
// incrementally so active lesson data remains compatible throughout the change.
import * as theory from './music/theory.js';
import * as tabModel from './music/tab-model.js';
import * as scoreDocument from './music/score-document.js';
import { storage } from './core/storage.js';
import * as audio from './core/audio.js';
import { createHistory } from './core/history.js';

window.GuitarTool = Object.freeze({ theory, tabModel, scoreDocument, storage, audio, createHistory });
