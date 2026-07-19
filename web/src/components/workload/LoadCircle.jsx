import { Circle } from '@chakra-ui/react';

const colorForLoad = (loadPercent) => {
  if (loadPercent === null) return 'gray.400';
  if (loadPercent <= 70) return 'green.500';
  if (loadPercent <= 95) return 'yellow.400';
  return 'red.500';
};

const textColorForLoad = (loadPercent) =>
  loadPercent !== null && loadPercent > 70 && loadPercent <= 95 ? 'gray.800' : 'white';

const LoadCircle = ({ loadPercent, onClick }) => (
  <Circle
    size="50px"
    bg={colorForLoad(loadPercent)}
    color={textColorForLoad(loadPercent)}
    fontWeight="bold"
    fontSize="xs"
    cursor={onClick ? 'pointer' : 'default'}
    onClick={onClick}
  >
    {loadPercent === null ? '—' : `${Math.round(loadPercent)}%`}
  </Circle>
);

export default LoadCircle;
