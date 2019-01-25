package routers

import (
	"github.com/gorilla/websocket"
	"github.com/labstack/echo"
	"github.com/luca-moser/visualizer.iota-tangle.io/server/controllers"
)

type TxsRouter struct {
	WebEngine  *echo.Echo              `inject:""`
	TxFeedCtrl *controllers.TxFeedCtrl `inject:""`
}

var (
	upgrader = websocket.Upgrader{}
)

func (txsRouter *TxsRouter) Init() {

	feedCtrl := txsRouter.TxFeedCtrl
	e := txsRouter.WebEngine
	group := e.Group("/api/txs")
	group.GET("", func(c echo.Context) error {
		ws, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
		if err != nil {
			return err
		}

		writer := make(chan interface{})
		stop := make(chan struct{})

		feedId, feed := feedCtrl.Subscribe()
		ws.SetCloseHandler(func(code int, text string) error {
			close(stop)
			feedCtrl.RemoveSubscriber(feedId)
			return nil
		})

		// sync WS writer
		go func() {
			for {
				select {
				case msgToWrite, ok := <-writer:
					if !ok {
						return
					}
					if err := ws.WriteJSON(msgToWrite); err != nil {
						return
					}
				case <-stop:
					return
				}
			}
		}()

		go func() {
			for {
				select {
				case tx, ok := <-feed:
					if !ok {
						return
					}
					writer <- tx
				case <-stop:
					return
				}
			}
		}()
		<-stop
		return nil
	})
}
