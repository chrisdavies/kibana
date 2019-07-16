/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { i18n } from '@kbn/i18n';
import { Datasource, FramePublicAPI } from '../../types';
import { EditorFrameProps } from '../editor_frame';
import { Document } from '../../persistence/saved_object_store';

export interface EditorFrameState {
  persistedId?: string;
  saving: boolean;
  title: string;
  visualization: {
    activeId: string | null;
    state: unknown;
  };
  datasourceMap: Record<string, Datasource<unknown, unknown>>;
  datasourceStates: Record<string, { state: unknown; isLoading: boolean }>;
  activeDatasourceId: string | null;
  layerIdToDatasource: FramePublicAPI['layerIdToDatasource'];
}

export type Action =
  | {
      type: 'RESET';
      state: EditorFrameState;
    }
  | {
      type: 'SAVING';
      isSaving: boolean;
    }
  | {
      type: 'UPDATE_TITLE';
      title: string;
    }
  | {
      type: 'UPDATE_PERSISTED_ID';
      id: string;
    }
  | {
      type: 'UPDATE_DATASOURCE_STATE';
      newState: unknown;
    }
  | {
      type: 'UPDATE_VISUALIZATION_STATE';
      newState: unknown;
    }
  | {
      type: 'VISUALIZATION_LOADED';
      doc: Document;
    }
  | {
      type: 'SWITCH_VISUALIZATION';
      newVisualizationId: string;
      initialState: unknown;
      datasourceState?: unknown;
    }
  | {
      type: 'SWITCH_DATASOURCE';
      newDatasourceId: string;
    }
  | {
      type: 'CREATE_LAYER';
      newLayerId: string;
      newDatasourceState: unknown;
    }
  | {
      type: 'UPDATE_LAYERS';
      layerToDatasourceId: Record<string, string>;
    };

export const getInitialState = (props: EditorFrameProps): EditorFrameState => {
  return {
    saving: false,
    title: i18n.translate('xpack.lens.chartTitle', { defaultMessage: 'New visualization' }),
    datasourceMap: props.datasourceMap,
    datasourceStates: props.initialDatasourceId
      ? {
          [props.initialDatasourceId]: {
            state: null,
            isLoading: Boolean(props.initialDatasourceId),
          },
        }
      : {},
    activeDatasourceId: props.initialDatasourceId,
    visualization: {
      state: null,
      activeId: props.initialVisualizationId,
    },
    layerIdToDatasource: {},
  };
};

export const reducer = (state: EditorFrameState, action: Action): EditorFrameState => {
  switch (action.type) {
    case 'SAVING':
      return { ...state, saving: action.isSaving };
    case 'RESET':
      return action.state;
    case 'UPDATE_PERSISTED_ID':
      return { ...state, persistedId: action.id };
    case 'UPDATE_TITLE':
      return { ...state, title: action.title };
    case 'VISUALIZATION_LOADED':
      return {
        ...state,
        persistedId: action.doc.id,
        title: action.doc.title,
        datasourceStates: action.doc.datasourceType
          ? {
              ...state.datasourceStates,
              [action.doc.datasourceType]: {
                isLoading: true,
                state: action.doc.state.datasource,
              },
            }
          : state.datasourceStates,
        activeDatasourceId: action.doc.datasourceType || null,

        visualization: {
          ...state.visualization,
          activeId: action.doc.visualizationType,
          state: action.doc.state.visualization,
        },
      };
    case 'SWITCH_DATASOURCE':
      return {
        ...state,
        datasourceStates: {
          ...state.datasourceStates,
          [action.newDatasourceId]: {
            state: null,
            isLoading: true,
          },
        },
        activeDatasourceId: action.newDatasourceId,
        visualization: {
          ...state.visualization,
          // purge visualization on datasource switch
          state: null,
          activeId: null,
        },
      };
    case 'SWITCH_VISUALIZATION':
      return {
        ...state,
        visualization: {
          ...state.visualization,
          activeId: action.newVisualizationId,
          state: action.initialState,
        },
      };
    case 'UPDATE_LAYERS':
      return {
        ...state,
        layerIdToDatasource: action.layerToDatasourceId,
      };
    case 'UPDATE_DATASOURCE_STATE':
      return {
        ...state,
        datasourceStates: {
          ...state.datasourceStates,
          [state.activeDatasourceId!]: {
            state: action.newState,
            isLoading: false,
          },
        },
      };
    case 'UPDATE_VISUALIZATION_STATE':
      if (!state.visualization.activeId) {
        throw new Error('Invariant: visualization state got updated without active visualization');
      }
      return {
        ...state,
        visualization: {
          ...state.visualization,
          state: action.newState,
        },
      };
    case 'CREATE_LAYER':
      return {
        ...state,
        layerIdToDatasource: {
          ...state.layerIdToDatasource,
          [action.newLayerId]: state.activeDatasourceId!,
        },
        datasourceStates: {
          ...state.datasourceStates,
          [state.activeDatasourceId!]: {
            state: action.newDatasourceState,
            isLoading: false,
          },
        },
      };
    default:
      return state;
  }
};
