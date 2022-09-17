import React from 'react';
import styles from './warning.module.scss';
import { Alert } from '@site/src/components/alert/alert';
import { Icon } from '@site/src/components/icon/icon';
import { Button } from '@site/src/components/button/button';
import Dialogue from '../dialogue/dialogue';
import Pane from '../pane/pane';
import { Size, UpscaleChoice } from '../../types';

export type Choose = (option: UpscaleChoice) => void;
export default function Warning({
  choose,
  img,
  originalSize: { width, height },
}: {
  img: HTMLImageElement;
  choose: Choose;
  originalSize: Size,
}) {
  return (
    <Dialogue>
      <Pane> 
      <div id={styles.warning}>
        <Alert variant="warning" open>
          <Icon slot="icon" name="exclamation-triangle" />
          <strong>Large Image Detected</strong>
        </Alert>
        <img id={styles.uploadedImage} src={img.src} />
        <p>
          Your image is <strong>{width}</strong> by <strong>{height}</strong> pixels, 
          which may be too large to upscale in your browser. 
          It&apos;s recommended that we first downscale your image 
          to <strong>{img.width}</strong> by <strong>{img.height}</strong> before 
          upscaling to demonstrate UpscalerJS.
        </p>
        <p>
          The speed of upscaling is determined by your hardware, browser, and the model you 
          choose. Larger images can take extremely long amounts of time to upscale in the browser 
          or, for particularly older hardware, crash your browser.
        </p>
        <p>
          To upscale larger images fast, you can run UpscalerJS server-side using NodeJS, 
          and for the best speed, leverage a server-side GPU.
        </p>
        <div id={styles.options}>
          <div id={styles.left}>
          <a onClick={() => choose('original')}>I understand, use the original image!</a>
          </div>
          <div id={styles.right}>
            <Button variant='primary' onClick={() => choose('downscaled')}>
              Use the downscaled version
            </Button>
          </div>
        </div>
      </div>
      </Pane>
    </Dialogue>
  );
}