/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import React from 'react';

interface Props {
  children: React.ReactNode | React.ReactNode[];
}

interface State {
  scale: number;
}

export class AutoScale extends React.Component<Props, State> {
  private child: Element | null = null;
  private parent: Element | null = null;

  constructor(props: Props) {
    super(props);

    // An initial scale of 0 means we always redraw
    // at least once, which is sub-optimal, but it
    // prevents an annoying flicker.
    this.state = { scale: 0 };
  }

  setParent = (el: Element | null) => {
    if (this.parent !== el) {
      this.parent = el;
      setTimeout(() => this.scale());
    }
  };

  setChild = (el: Element | null) => {
    if (this.child !== el) {
      this.child = el;
      setTimeout(() => this.scale());
    }
  };

  scale() {
    const scale = computeScale(this.parent, this.child);

    // Prevent an infinite render loop
    if (this.state.scale !== scale) {
      this.setState({ scale });
    }
  }

  render() {
    const { children } = this.props;
    const { scale } = this.state;

    return (
      <div
        className="autoscale-parent"
        ref={this.setParent}
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          position: 'relative',
          maxWidth: '100%',
          maxHeight: '100%',
        }}
      >
        <div
          className="autoscale-child"
          ref={this.setChild}
          style={{
            transform: `scale(${scale})`,
          }}
        >
          {children}
        </div>
      </div>
    );
  }
}

interface ClientDimensionable {
  clientWidth: number;
  clientHeight: number;
}

/**
 * computeScale computes the ratio by which the child needs to shrink in order
 * to fit into the parent. This function is only exported for testing purposes.
 */
export function computeScale(
  parent: ClientDimensionable | null,
  child: ClientDimensionable | null
) {
  if (!parent || !child) {
    return 1;
  }

  const scaleX = (parent.clientWidth) / child.clientWidth;
  const scaleY = (parent.clientHeight) / child.clientHeight;

  return Math.min(1, Math.min(scaleX, scaleY));
}
