FROM python:3.10 AS dependencies-build

WORKDIR /dependencies

ENV TZ=US/Central
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

RUN apt-get update && apt-get -y upgrade

RUN mkdir -p /home/charge/chargefw2 && \
    mkdir -p /home/charge/flask  && \
    mkdir -p /home/charge/logs

RUN apt-get install -y git build-essential cmake ninja-build wget \
        lsb-release software-properties-common libomp-dev \
        libgtest-dev libeigen3-dev libboost-all-dev \
        libfmt-dev nlohmann-json3-dev python3-pybind11 \
        python3-dev python3-pip clang

RUN git clone --depth 1 --branch v1.3.2 https://github.com/jlblancoc/nanoflann.git && \
    cd nanoflann && mkdir build && cd build && \
    cmake .. -DCMAKE_CXX_COMPILER=clang++ && \
    make && make install

RUN git clone --depth 1 https://github.com/project-gemmi/gemmi.git && \
    cp -r gemmi/include/gemmi /usr/include

RUN git clone --depth 1 https://github.com/MergunFrimen/ChargeFW2.git && \
    cd ChargeFW2 && git checkout master && mkdir build && cd build && \
    cmake .. -GNinja \
        -DCMAKE_CXX_COMPILER=clang++ \
        -DCMAKE_INSTALL_PREFIX=/home/charge/chargefw2 \
        -DCMAKE_BUILD_TYPE=Release && \
    ninja && ninja install

ENV PYTHONPATH=/usr/local/lib

FROM dependencies-build AS app-build

WORKDIR /home/charge/flask

ADD . /home/charge/flask

RUN pip install -r requirements.txt

CMD ["uwsgi", "app.ini"]
