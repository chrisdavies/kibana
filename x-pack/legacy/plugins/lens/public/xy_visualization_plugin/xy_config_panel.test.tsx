/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import React from 'react';
import { ReactWrapper } from 'enzyme';
import { mountWithIntl as mount } from 'test_utils/enzyme_helpers';
import { EuiButtonGroupProps } from '@elastic/eui';
import { XYConfigPanel } from './xy_config_panel';
import { DatasourceDimensionPanelProps, Operation } from '../types';
import { State, SeriesType } from './types';
import { Position } from '@elastic/charts';
import { NativeRendererProps } from '../native_renderer';
import { generateId } from '../id_generator';
import { createMockFramePublicAPI, createMockDatasource } from '../editor_frame_plugin/mocks';

jest.mock('../id_generator');

describe('XYConfigPanel', () => {
  const dragDropContext = { dragging: undefined, setDragging: jest.fn() };

  function testState(): State {
    return {
      legend: { isVisible: true, position: Position.Right },
      layers: [
        {
          seriesType: 'bar',
          layerId: 'first',
          datasourceId: '',
          splitAccessor: 'baz',
          xAccessor: 'foo',
          position: Position.Bottom,
          showGridlines: true,
          title: 'X',
          accessors: ['bar'],
          labels: [''],
        },
      ],
    };
  }

  function testSubj(component: ReactWrapper<unknown>, subj: string) {
    return component
      .find(`[data-test-subj="${subj}"]`)
      .first()
      .props();
  }

  test('disables stacked chart types without a split series', () => {
    const component = mount(
      <XYConfigPanel
        dragDropContext={dragDropContext}
        frame={createMockFramePublicAPI()}
        setState={() => {}}
        state={testState()}
      />
    );

    const options = component
      .find('[data-test-subj="lnsXY_seriesType"]')
      .first()
      .prop('options') as EuiButtonGroupProps['options'];

    expect(options.map(({ id }) => id)).toEqual([
      'line',
      'area',
      'bar',
      'horizontal_bar',
      'area_stacked',
      'bar_stacked',
      'horizontal_bar_stacked',
    ]);

    expect(options.filter(({ isDisabled }) => isDisabled).map(({ id }) => id)).toEqual([
      'area_stacked',
      'bar_stacked',
      'horizontal_bar_stacked',
    ]);
  });

  test('enables all stacked chart types when there is a split series', () => {
    const state = testState();
    const component = mount(
      <XYConfigPanel
        dragDropContext={dragDropContext}
        frame={createMockFramePublicAPI()}
        setState={() => {}}
        state={{ ...state, layers: [{ ...state.layers[0], splitAccessor: 'c' }] }}
      />
    );

    const options = component
      .find('[data-test-subj="lnsXY_seriesType"]')
      .first()
      .prop('options') as EuiButtonGroupProps['options'];

    expect(options.every(({ isDisabled }) => !isDisabled)).toEqual(true);
  });

  test('toggles axis position when going from horizontal bar to any other type', () => {
    const changeSeriesType = (fromSeriesType: SeriesType, toSeriesType: SeriesType) => {
      const setState = jest.fn();
      const state = testState();
      const component = mount(
        <XYConfigPanel
          dragDropContext={dragDropContext}
          frame={createMockFramePublicAPI()}
          setState={setState}
          state={{ ...state, layers: [{ ...state.layers[0], seriesType: fromSeriesType }] }}
        />
      );

      (testSubj(component, 'lnsXY_seriesType').onChange as Function)(toSeriesType);

      expect(setState).toHaveBeenCalledTimes(1);
      return setState.mock.calls[0][0];
    };

    expect(changeSeriesType('line', 'horizontal_bar')).toMatchObject({
      seriesType: 'horizontal_bar',
      x: { position: Position.Left },
      y: { position: Position.Bottom },
    });
    expect(changeSeriesType('horizontal_bar', 'bar')).toMatchObject({
      seriesType: 'bar',
      x: { position: Position.Bottom },
      y: { position: Position.Left },
    });
    expect(changeSeriesType('horizontal_bar', 'line')).toMatchObject({
      seriesType: 'line',
      x: { position: Position.Bottom },
      y: { position: Position.Left },
    });
    expect(changeSeriesType('horizontal_bar', 'area')).toMatchObject({
      seriesType: 'area',
      x: { position: Position.Bottom },
      y: { position: Position.Left },
    });
  });

  test('allows toggling of legend visibility', () => {
    const toggleIsVisible = (isVisible: boolean) => {
      const setState = jest.fn();
      const state = testState();
      const component = mount(
        <XYConfigPanel
          dragDropContext={dragDropContext}
          frame={createMockFramePublicAPI()}
          setState={setState}
          state={{ ...state, legend: { ...state.legend, isVisible } }}
        />
      );

      (testSubj(component, 'lnsXY_legendIsVisible').onChange as Function)();

      expect(setState).toHaveBeenCalledTimes(1);
      return setState.mock.calls[0][0];
    };

    expect(toggleIsVisible(false)).toMatchObject({
      legend: { isVisible: true },
    });
    expect(toggleIsVisible(true)).toMatchObject({
      legend: { isVisible: false },
    });
  });

  test('allows changing legend position', () => {
    const testLegendPosition = (position: Position) => {
      const setState = jest.fn();
      const component = mount(
        <XYConfigPanel
          dragDropContext={dragDropContext}
          frame={createMockFramePublicAPI()}
          setState={setState}
          state={testState()}
        />
      );

      (testSubj(component, 'lnsXY_legendPosition').onChange as Function)(position);

      expect(setState).toHaveBeenCalledTimes(1);
      return setState.mock.calls[0][0];
    };

    expect(testLegendPosition(Position.Bottom)).toMatchObject({
      legend: { position: Position.Bottom },
    });
    expect(testLegendPosition(Position.Top)).toMatchObject({
      legend: { position: Position.Top },
    });
    expect(testLegendPosition(Position.Left)).toMatchObject({
      legend: { position: Position.Left },
    });
    expect(testLegendPosition(Position.Right)).toMatchObject({
      legend: { position: Position.Right },
    });
  });

  test('allows editing the x axis title', () => {
    const testSetTitle = (title: string) => {
      const setState = jest.fn();
      const component = mount(
        <XYConfigPanel
          dragDropContext={dragDropContext}
          frame={createMockFramePublicAPI()}
          setState={setState}
          state={testState()}
        />
      );

      (testSubj(component, 'lnsXY_xTitle').onChange as Function)({ target: { value: title } });

      expect(setState).toHaveBeenCalledTimes(1);
      return setState.mock.calls[0][0];
    };

    expect(testSetTitle('Hoi')).toMatchObject({
      x: { title: 'Hoi' },
    });
    expect(testSetTitle('There!')).toMatchObject({
      x: { title: 'There!' },
    });
  });

  test('the x dimension panel accepts any operations', () => {
    const state = testState();
    const component = mount(
      <XYConfigPanel
        dragDropContext={dragDropContext}
        frame={createMockFramePublicAPI()}
        setState={jest.fn()}
        state={{ ...state, layers: [{ ...state.layers[0], xAccessor: 'shazm' }] }}
      />
    );

    const panel = testSubj(component, 'lnsXY_xDimensionPanel');
    const nativeProps = (panel as NativeRendererProps<DatasourceDimensionPanelProps>).nativeProps;
    const { columnId, filterOperations } = nativeProps;
    const exampleOperation: Operation = {
      dataType: 'number',
      id: 'foo',
      isBucketed: false,
      label: 'bar',
    };
    const ops: Operation[] = [
      { ...exampleOperation, dataType: 'number' },
      { ...exampleOperation, dataType: 'string' },
      { ...exampleOperation, dataType: 'boolean' },
      { ...exampleOperation, dataType: 'date' },
    ];
    expect(columnId).toEqual('shazm');
    expect(ops.filter(filterOperations)).toEqual(ops);
  });

  test('allows toggling the x axis gridlines', () => {
    const toggleXGridlines = (showGridlines: boolean) => {
      const setState = jest.fn();
      const state = testState();
      const component = mount(
        <XYConfigPanel
          dragDropContext={dragDropContext}
          frame={createMockFramePublicAPI()}
          setState={setState}
          state={{ ...state, layers: [{ ...state.layers[0], showGridlines }] }}
        />
      );

      (testSubj(component, 'lnsXY_xShowGridlines').onChange as Function)();

      expect(setState).toHaveBeenCalledTimes(1);
      return setState.mock.calls[0][0];
    };

    expect(toggleXGridlines(true)).toMatchObject({
      x: { showGridlines: false },
    });
    expect(toggleXGridlines(false)).toMatchObject({
      x: { showGridlines: true },
    });
  });

  test('allows editing the y axis title', () => {
    const testSetTitle = (title: string) => {
      const setState = jest.fn();
      const component = mount(
        <XYConfigPanel
          dragDropContext={dragDropContext}
          frame={createMockFramePublicAPI()}
          setState={setState}
          state={testState()}
        />
      );

      (testSubj(component, 'lnsXY_yTitle').onChange as Function)({ target: { value: title } });

      expect(setState).toHaveBeenCalledTimes(1);
      return setState.mock.calls[0][0];
    };

    expect(testSetTitle('Hoi')).toMatchObject({
      y: { title: 'Hoi' },
    });
    expect(testSetTitle('There!')).toMatchObject({
      y: { title: 'There!' },
    });
  });

  test('the y dimension panel accepts numeric operations', () => {
    const state = testState();
    const component = mount(
      <XYConfigPanel
        dragDropContext={dragDropContext}
        frame={createMockFramePublicAPI()}
        setState={jest.fn()}
        state={{ ...state, layers: [{ ...state.layers[0], accessors: ['a', 'b', 'c'] }] }}
      />
    );

    const panel = testSubj(component, 'lnsXY_yDimensionPanel_a');
    const nativeProps = (panel as NativeRendererProps<DatasourceDimensionPanelProps>).nativeProps;
    const { filterOperations } = nativeProps;
    const exampleOperation: Operation = {
      dataType: 'number',
      id: 'foo',
      isBucketed: false,
      label: 'bar',
    };
    const ops: Operation[] = [
      { ...exampleOperation, dataType: 'number' },
      { ...exampleOperation, dataType: 'string' },
      { ...exampleOperation, dataType: 'boolean' },
      { ...exampleOperation, dataType: 'date' },
    ];
    expect(ops.filter(filterOperations).map(x => x.dataType)).toEqual(['number']);
  });

  test('allows removal of y dimensions', () => {
    const frame = createMockFramePublicAPI();
    const datasourceMock = createMockDatasource().publicAPIMock;
    frame.datasourceLayers = {
      first: datasourceMock,
    };
    const setState = jest.fn();
    const state = testState();
    const component = mount(
      <XYConfigPanel
        dragDropContext={dragDropContext}
        frame={frame}
        setState={setState}
        state={{ ...state, layers: [{ ...state.layers[0], accessors: ['a', 'b', 'c'] }] }}
      />
    );

    (testSubj(component, 'lnsXY_yDimensionPanel_remove_b').onClick as Function)();

    expect(setState).toHaveBeenCalledTimes(1);
    expect(setState.mock.calls[0][0]).toMatchObject({
      y: { accessors: ['a', 'c'] },
    });
    expect(datasourceMock.removeColumnInTableSpec).toHaveBeenCalledTimes(1);
    expect(datasourceMock.removeColumnInTableSpec).toHaveBeenCalledWith('b');
  });

  test('allows adding y dimensions', () => {
    (generateId as jest.Mock).mockReturnValueOnce('zed');
    const setState = jest.fn();
    const state = testState();
    const component = mount(
      <XYConfigPanel
        dragDropContext={dragDropContext}
        frame={createMockFramePublicAPI()}
        setState={setState}
        state={{ ...state, layers: [{ ...state.layers[0], accessors: ['a', 'b', 'c'] }] }}
      />
    );

    (testSubj(component, 'lnsXY_yDimensionPanel_add').onClick as Function)();

    expect(setState).toHaveBeenCalledTimes(1);
    expect(setState.mock.calls[0][0]).toMatchObject({
      y: { accessors: ['a', 'b', 'c', 'zed'] },
    });
  });
});
