/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import React from 'react';
import { createMockVisualization, createMockFramePublicAPI } from '../mocks';
import { mountWithIntl as mount } from 'test_utils/enzyme_helpers';
import { ReactWrapper } from 'enzyme';
import { ConfigPanelHeader } from './config_panel_header';
import { Visualization } from '../../types';

describe('config_panel_header', () => {
  function generateVisualization(id: string): jest.Mocked<Visualization> {
    return {
      ...createMockVisualization(),
      id,
      visualizationTypes: [
        {
          icon: 'empty',
          id: `sub${id}`,
          label: `Label ${id}`,
        },
      ],
      initialize: jest.fn((_frame, state?: unknown) => {
        return state || `${id} initial state`;
      }),
      getSuggestions: jest.fn(_options => {
        return [
          {
            score: 1,
            title: '',
            state: `suggestion ${id}`,
            datasourceSuggestionId: 1,
            previewIcon: 'empty',
          },
        ];
      }),
    };
  }

  function mockVisualizations() {
    return {
      visA: generateVisualization('visA'),
      visB: generateVisualization('visB'),
      visC: {
        ...generateVisualization('visC'),
        visualizationTypes: [
          {
            icon: 'empty',
            id: 'subvisC1',
            label: 'C1',
          },
          {
            icon: 'empty',
            id: 'subvisC2',
            label: 'C2',
          },
        ],
      },
    };
  }

  function mockFrame(layers: string[]) {
    return {
      ...createMockFramePublicAPI(),
      datasourceLayers: layers.reduce(
        jest.fn((acc, layerId) => ({
          ...acc,
          [layerId]: {
            getTableSpec() {
              return [{ columnId: 2 }];
            },
            getOperationForColumnId() {
              return {};
            },
          },
        })),
        {}
      ),
    };
  }

  function showFlyout(component: ReactWrapper) {
    component
      .find('[data-test-subj="lnsConfigPanelHeaderPopover"]')
      .first()
      .simulate('click');
  }

  function switchTo(subType: string, component: ReactWrapper) {
    showFlyout(component);
    component
      .find(`[data-test-subj="lnsConfigPanelHeaderPopover_${subType}"]`)
      .first()
      .simulate('click');
  }

  function confirm(component: ReactWrapper) {
    component
      .find('[data-test-subj="confirmModalConfirmButton"]')
      .first()
      .simulate('click');
  }

  function deny(component: ReactWrapper) {
    component
      .find('[data-test-subj="confirmModalCancelButton"]')
      .first()
      .simulate('click');
  }

  function isModalVisible(component: ReactWrapper) {
    return component.find('[data-test-subj="lnsConfirmDropLayer"]').length > 0;
  }

  it('should not prompt for confirmation if there is only one layer', () => {
    const dispatch = jest.fn();
    const visualizations = mockVisualizations();
    const component = mount(
      <ConfigPanelHeader
        visualizationId="visA"
        visualizationState={{}}
        visualizationMap={visualizations}
        dispatch={dispatch}
        framePublicAPI={mockFrame(['a'])}
      />
    );

    switchTo('subvisB', component);

    expect(dispatch).toHaveBeenCalledWith({
      initialState: 'suggestion visB',
      newVisualizationId: 'visB',
      type: 'SWITCH_VISUALIZATION',
    });
  });

  it('should prompt for confirmation if there is more than one layer', () => {
    const dispatch = jest.fn();
    const component = mount(
      <ConfigPanelHeader
        visualizationId="visA"
        visualizationState={{}}
        visualizationMap={mockVisualizations()}
        dispatch={dispatch}
        framePublicAPI={mockFrame(['a', 'b'])}
      />
    );

    switchTo('subvisB', component);

    expect(dispatch).not.toHaveBeenCalled();

    expect(isModalVisible(component)).toBeTruthy();
    confirm(component);

    expect(isModalVisible(component)).toBeFalsy();

    expect(dispatch).toHaveBeenCalledWith({
      initialState: 'suggestion visB',
      newVisualizationId: 'visB',
      type: 'SWITCH_VISUALIZATION',
    });
  });

  it('should remove unused layers', () => {
    const removeLayer = jest.fn();
    const frame = {
      ...mockFrame(['a', 'b', 'c']),
      removeLayer,
    };
    const component = mount(
      <ConfigPanelHeader
        visualizationId="visA"
        visualizationState={{}}
        visualizationMap={mockVisualizations()}
        dispatch={jest.fn()}
        framePublicAPI={frame}
      />
    );

    switchTo('subvisB', component);
    confirm(component);

    expect(removeLayer).toHaveBeenCalledTimes(2);
    expect(removeLayer).toHaveBeenCalledWith('b');
    expect(removeLayer).toHaveBeenCalledWith('c');
  });

  it('should not prompt for confirmation if the visualization is not changing', () => {
    const dispatch = jest.fn();
    const visualizations = mockVisualizations();
    const switchVisualizationType = jest.fn(() => 'therebedragons');

    visualizations.visC.switchVisualizationType = switchVisualizationType;

    const component = mount(
      <ConfigPanelHeader
        visualizationId="visC"
        visualizationState={'therebegriffins'}
        visualizationMap={visualizations}
        dispatch={dispatch}
        framePublicAPI={mockFrame(['a', 'b'])}
      />
    );

    switchTo('subvisC2', component);
    expect(isModalVisible(component)).toBeFalsy();
    expect(switchVisualizationType).toHaveBeenCalledWith('subvisC2', 'therebegriffins');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'UPDATE_VISUALIZATION_STATE',
      newState: 'therebedragons',
    });
  });

  it('should ensure the new visualization has the proper subtype', () => {
    const dispatch = jest.fn();
    const visualizations = mockVisualizations();
    const switchVisualizationType = jest.fn(
      (visualizationType, state) => `${state} ${visualizationType}`
    );

    visualizations.visB.switchVisualizationType = switchVisualizationType;

    const component = mount(
      <ConfigPanelHeader
        visualizationId="visA"
        visualizationState={{}}
        visualizationMap={visualizations}
        dispatch={dispatch}
        framePublicAPI={mockFrame(['a'])}
      />
    );

    switchTo('subvisB', component);

    expect(dispatch).toHaveBeenCalledWith({
      initialState: 'suggestion visB subvisB',
      newVisualizationId: 'visB',
      type: 'SWITCH_VISUALIZATION',
    });
  });

  it('should not process the change, if cancelled', () => {
    const dispatch = jest.fn();
    const component = mount(
      <ConfigPanelHeader
        visualizationId="visA"
        visualizationState={{}}
        visualizationMap={mockVisualizations()}
        dispatch={dispatch}
        framePublicAPI={mockFrame(['a', 'b'])}
      />
    );

    switchTo('subvisB', component);

    expect(isModalVisible(component)).toBeTruthy();
    expect(dispatch).not.toHaveBeenCalled();

    deny(component);

    expect(isModalVisible(component)).toBeFalsy();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('should show all visualization types', () => {
    const component = mount(
      <ConfigPanelHeader
        visualizationId="visA"
        visualizationState={{}}
        visualizationMap={mockVisualizations()}
        dispatch={jest.fn()}
        framePublicAPI={mockFrame(['a', 'b'])}
      />
    );

    showFlyout(component);

    const allDisplayed = ['subvisA', 'subvisB', 'subvisC1', 'subvisC2'].every(
      subType =>
        component.find(`[data-test-subj="lnsConfigPanelHeaderPopover_${subType}"]`).length > 0
    );

    expect(allDisplayed).toBeTruthy();
  });
});
