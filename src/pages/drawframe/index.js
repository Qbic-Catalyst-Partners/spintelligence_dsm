export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/draw-frame",
      permanent: false,
    },
  };
}

export default function DrawFrameIndexPage() {
  return null;
}
