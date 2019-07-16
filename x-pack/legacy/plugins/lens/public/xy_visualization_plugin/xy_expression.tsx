/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import React from 'react';
import ReactDOM from 'react-dom';
import {
  Chart,
  Settings,
  Axis,
  LineSeries,
  getAxisId,
  getSpecId,
  AreaSeries,
  BarSeries,
  Position,
} from '@elastic/charts';
import { ExpressionFunction } from 'src/legacy/core_plugins/interpreter/types';
import { XYArgs } from './types';
import { KibanaDatatable } from '../types';
import { RenderFunction } from '../interpreter_types';

export interface XYChartProps {
  data: KibanaDatatable;
  args: XYArgs;
}

export interface XYRender {
  type: 'render';
  as: 'lens_xy_chart_renderer';
  value: XYChartProps;
}

export const xyChart: ExpressionFunction<'lens_xy_chart', KibanaDatatable, XYArgs, XYRender> = ({
  name: 'lens_xy_chart',
  type: 'render',
  help: 'An X/Y chart',
  args: {
    legend: {
      types: ['lens_xy_legendConfig'],
      help: 'Configure the chart legend.',
    },
    // y: {
    //   types: ['lens_xy_yConfig'],
    //   help: 'The y axis configuration',
    // },
    x: {
      types: ['lens_xy_xConfig'],
      help: 'The x axis configuration',
    },
    // splitSeriesAccessors: {
    //   types: ['string'],
    //   multi: true,
    //   help: 'The columns used to split the series.',
    // },
    layers: {
      types: ['lens_xy_layer'],
      help: 'Layers of visual series',
      multi: true,
    },
  },
  context: {
    types: ['kibana_datatable'],
  },
  fn(data: KibanaDatatable, args: XYArgs) {
    return {
      type: 'render',
      as: 'lens_xy_chart_renderer',
      value: {
        data,
        args,
      },
    };
  },
  // TODO the typings currently don't support custom type args. As soon as they do, this can be removed
} as unknown) as ExpressionFunction<'lens_xy_chart', KibanaDatatable, XYArgs, XYRender>;

export interface XYChartProps {
  data: KibanaDatatable;
  args: XYArgs;
}

export const xyChartRenderer: RenderFunction<XYChartProps> = {
  name: 'lens_xy_chart_renderer',
  displayName: 'XY Chart',
  help: 'X/Y Chart Renderer',
  validate: () => {},
  reuseDomNode: true,
  render: async (domNode: Element, config: XYChartProps, _handlers: unknown) => {
    ReactDOM.render(<XYChart {...config} />, domNode);
  },
};

export function XYChart({ data, args }: XYChartProps) {
  const { legend, layers } = args;

  return (
    <Chart className="lnsChart">
      <Settings
        showLegend={legend.isVisible}
        legendPosition={legend.position}
        showLegendDisplayValue={false}
        rotation={layers.some(({ seriesType }) => seriesType.includes('horizontal')) ? 90 : 0}
      />

      <Axis
        id={getAxisId('x')}
        position={Position.Bottom}
        // title={layers.title}
        title={'X'}
        showGridLines={false}
        hide={layers[0].hide}
      />

      <Axis
        id={getAxisId('y')}
        position={Position.Left}
        title={layers[0].title}
        showGridLines={layers[0].showGridlines}
        hide={layers[0].hide}
      />

      {layers.map(
        ({ splitSeriesAccessors, seriesType, labels, accessors, xAccessor, layerId }, index) => {
          const seriesDataRow = data.rows.find(row => row[layerId]);
          const seriesData = seriesDataRow ? seriesDataRow[layerId] : null;

          if (!seriesData) {
            return;
          }

          const idForCaching = accessors.concat([xAccessor], splitSeriesAccessors).join(',');

          const seriesProps = {
            key: index,
            splitSeriesAccessors,
            stackAccessors: seriesType.includes('stacked') ? [xAccessor] : [],
            id: getSpecId(idForCaching),
            xAccessor,
            yAccessors: labels,
            data: (seriesData as KibanaDatatable).rows.map(row => {
              const newRow: typeof row = {};

              // Remap data to { 'Count of documents': 5 }
              Object.keys(row).forEach(key => {
                const labelIndex = accessors.indexOf(key);
                if (labelIndex > -1) {
                  newRow[labels[labelIndex]] = row[key];
                } else {
                  newRow[key] = row[key];
                }
              });
              return newRow;
            }),
          };

          return seriesType === 'line' ? (
            <LineSeries {...seriesProps} />
          ) : seriesType === 'bar' ||
            seriesType === 'bar_stacked' ||
            seriesType === 'horizontal_bar' ||
            seriesType === 'horizontal_bar_stacked' ? (
            <BarSeries {...seriesProps} />
          ) : (
            <AreaSeries {...seriesProps} />
          );
        }
      )}
    </Chart>
  );
}
