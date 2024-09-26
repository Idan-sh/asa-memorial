import IMAGES from '../../assets/images/index';
import { Fade } from 'react-slideshow-image';
import 'react-slideshow-image/dist/styles.css';

export default function Slideshow() {
  const imagesArray: string[] = Object.values(IMAGES);

  return (
    <div className="slideshow-container">
      <Fade duration={3000}>
        {imagesArray.map((image) => (
          <div className="each-slide">
            <img src={image} />
          </div>
        ))}
      </Fade>
    </div>
  );
}
